import { describe, expect, it, vi } from 'vitest';

import type { UsersRepository } from '../repositories/users.repository.js';
import { AdminService } from './service.js';

const admin = { id: 1, role: 'admin' } as const;

function users(overrides: Partial<Record<keyof UsersRepository, unknown>> = {}) {
  const publicRows = [
    {
      id: 1,
      email: 'admin@example.com',
      username: 'admin',
      role: 'admin' as const,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      id: 2,
      email: 'user@example.com',
      username: 'user',
      role: 'user' as const,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    },
  ];
  return {
    listUsers: vi.fn().mockResolvedValue(publicRows),
    updateRole: vi.fn().mockResolvedValue({ ...publicRows[1]!, role: 'admin' as const }),
    ...overrides,
  };
}

describe('AdminService', () => {
  it('lists users without any password hash field', async () => {
    const repo = users();
    const service = new AdminService(repo as never);

    const listed = await service.listUsers();

    expect(listed.map((user) => user.id)).toEqual([1, 2]);
    for (const user of listed) {
      expect(Object.keys(user).sort()).toEqual(['createdAt', 'email', 'id', 'role', 'username']);
      expect(user).not.toHaveProperty('passwordHash');
    }
  });

  it('changes another user role and returns the public row', async () => {
    const repo = users();
    const service = new AdminService(repo as never);

    const updated = await service.setUserRole(admin, 2, 'admin');

    expect(repo.updateRole).toHaveBeenCalledWith(2, 'admin');
    expect(updated).toMatchObject({ id: 2, role: 'admin' });
    expect(updated).not.toHaveProperty('passwordHash');
  });

  it('refuses to change the acting admin own role', async () => {
    const repo = users();
    const service = new AdminService(repo as never);

    await expect(service.setUserRole(admin, 1, 'user')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Cannot change your own role',
    });
    expect(repo.updateRole).not.toHaveBeenCalled();
  });

  it('reports an unknown user as not found', async () => {
    const repo = users({ updateRole: vi.fn().mockResolvedValue(null) });
    const service = new AdminService(repo as never);

    await expect(service.setUserRole(admin, 404, 'admin')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
