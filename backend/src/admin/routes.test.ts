import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { AuthService } from '../auth/service.js';
import type { TokenService } from '../auth/tokens.js';
import type { Database } from '../db/client.js';

const state = vi.hoisted(() => ({
  currentUser: { sub: '1', role: 'admin' as 'user' | 'admin' },
  rows: [
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
  ],
}));

vi.mock('../repositories/users.repository.js', () => ({
  UsersRepository: class {
    async listUsers() {
      return state.rows;
    }
    async updateRole(id: number, role: 'user' | 'admin') {
      const row = state.rows.find((candidate) => candidate.id === id);
      if (!row) return null;
      row.role = role;
      return row;
    }
  },
}));

describe('admin routes', () => {
  const tokens = {
    verifyAccessToken: vi.fn(async () => ({ ...state.currentUser, type: 'access' })),
  } as unknown as TokenService;
  const app = buildApp({
    auth: { service: {} as AuthService, tokens, database: {} as Database },
  });
  const authHeaders = { authorization: 'Bearer admin-token' };

  beforeAll(async () => app.ready());
  afterAll(async () => app.close());
  beforeEach(() => {
    state.currentUser.sub = '1';
    state.currentUser.role = 'admin';
    state.rows[1]!.role = 'user';
  });

  it('requires authentication', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/v1/admin/users' });
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/users/2/role',
      payload: { role: 'admin' },
    });

    expect(list.statusCode).toBe(401);
    expect(patch.statusCode).toBe(401);
  });

  it('rejects authenticated non-admins', async () => {
    state.currentUser.role = 'user';

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: authHeaders,
    });
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/users/2/role',
      headers: authHeaders,
      payload: { role: 'admin' },
    });

    expect(list.statusCode).toBe(403);
    expect(list.json()).toMatchObject({ error: 'FORBIDDEN' });
    expect(patch.statusCode).toBe(403);
  });

  it('lists users with the public columns only', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<Record<string, unknown>>;
    expect(body).toHaveLength(2);
    expect(Object.keys(body[0]!).sort()).toEqual(['createdAt', 'email', 'id', 'role', 'username']);
    expect(JSON.stringify(body)).not.toContain('passwordHash');
  });

  it('updates a role and blocks self-demotion', async () => {
    const promoted = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/users/2/role',
      headers: authHeaders,
      payload: { role: 'admin' },
    });
    expect(promoted.statusCode).toBe(200);
    expect(promoted.json()).toMatchObject({ id: 2, role: 'admin' });

    const self = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/users/1/role',
      headers: authHeaders,
      payload: { role: 'user' },
    });
    expect(self.statusCode).toBe(403);
    expect(self.json()).toMatchObject({
      error: 'FORBIDDEN',
      message: 'Cannot change your own role',
    });
  });

  it('rejects an unknown role with 400 and a missing user with 404', async () => {
    const invalid = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/users/2/role',
      headers: authHeaders,
      payload: { role: 'superuser' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: 'VALIDATION_ERROR' });

    const missing = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/users/404/role',
      headers: authHeaders,
      payload: { role: 'admin' },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: 'NOT_FOUND' });
  });
});
