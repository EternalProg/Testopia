import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/client.js';
import { UsersRepository } from './users.repository.js';

function databaseMock() {
  const user = {
    id: 7,
    email: 'user@example.com',
    username: 'user',
    passwordHash: 'hash',
    role: 'user' as const,
    createdAt: new Date(),
  };
  const limit = vi.fn().mockResolvedValue([user]);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue([{ insertId: user.id }]),
  });

  return { db: { select, insert } as unknown as Database, user, select, insert };
}

describe('UsersRepository', () => {
  it('finds a user by email and hides absent rows as null', async () => {
    const mock = databaseMock();
    const repository = new UsersRepository(mock.db);

    await expect(repository.findByEmail(mock.user.email)).resolves.toEqual(mock.user);
    expect(mock.select).toHaveBeenCalledOnce();

    const absentLimit = vi.fn().mockResolvedValue([]);
    mock.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: absentLimit }) }),
    });
    await expect(repository.findById(99)).resolves.toBeNull();
  });

  it('creates and reloads a user', async () => {
    const mock = databaseMock();
    const repository = new UsersRepository(mock.db);

    await expect(
      repository.create({
        email: mock.user.email,
        username: mock.user.username,
        passwordHash: mock.user.passwordHash,
      }),
    ).resolves.toEqual(mock.user);
    expect(mock.insert).toHaveBeenCalledOnce();
  });

  it('fails if the inserted user cannot be reloaded', async () => {
    const mock = databaseMock();
    mock.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    });
    const repository = new UsersRepository(mock.db);

    await expect(
      repository.create({ email: 'a@b.com', username: 'ab', passwordHash: 'hash' }),
    ).rejects.toThrow('Created user could not be loaded');
  });

  it('lists and re-roles users through an explicit column select', async () => {
    const mock = databaseMock();
    const publicRow = {
      id: mock.user.id,
      email: mock.user.email,
      username: mock.user.username,
      role: 'admin' as const,
      createdAt: mock.user.createdAt,
    };
    const orderBy = vi.fn().mockResolvedValue([publicRow]);
    const from = vi.fn().mockReturnValue({ orderBy });
    mock.select.mockReturnValue({ from });
    const repository = new UsersRepository(mock.db);

    await expect(repository.listUsers()).resolves.toEqual([publicRow]);
    // A bare select() would pull password_hash into the admin response.
    expect(Object.keys(mock.select.mock.calls[0]![0] as object).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'role',
      'username',
    ]);
  });

  it('reports an absent user as null after a role update', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const db = {
      update,
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    } as unknown as Database;
    const repository = new UsersRepository(db);

    await expect(repository.updateRole(404, 'admin')).resolves.toBeNull();
    expect(set).toHaveBeenCalledWith({ role: 'admin' });
    expect(where).toHaveBeenCalledOnce();
  });
});
