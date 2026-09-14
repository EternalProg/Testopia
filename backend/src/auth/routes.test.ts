import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { AuthService } from './service.js';
import type { TokenService } from './tokens.js';

const publicUser = {
  id: 1,
  email: 'user@example.com',
  username: 'user',
  role: 'user' as const,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};
const session = {
  user: publicUser,
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  refreshTokenExpiresAt: new Date('2026-02-01T00:00:00.000Z'),
};

describe('authentication routes', () => {
  const service = {
    register: vi.fn().mockResolvedValue(session),
    login: vi.fn().mockResolvedValue(session),
    refresh: vi.fn().mockResolvedValue(session),
    logout: vi.fn().mockResolvedValue(undefined),
    currentUser: vi.fn().mockResolvedValue(publicUser),
  } as unknown as AuthService;
  const tokens = {
    verifyAccessToken: vi.fn().mockResolvedValue({ sub: '1', role: 'user', type: 'access' }),
  } as unknown as TokenService;
  const app = buildApp({ auth: { service, tokens } });

  beforeAll(async () => app.ready());
  afterAll(async () => app.close());

  it('registers and logs in using shared validation', async () => {
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'user@example.com', username: 'user', password: 'password123' },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'user@example.com', password: 'password123' },
    });

    expect(register.statusCode).toBe(201);
    expect(register.json()).not.toHaveProperty('user.passwordHash');
    expect(login.statusCode).toBe(200);
  });

  it('rejects invalid request bodies without invoking services', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'not-an-email', password: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(service.login).not.toHaveBeenCalledWith({ email: 'not-an-email', password: '' });
  });

  it('rotates refresh tokens, logs out, and protects the current-user route', async () => {
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: 'refresh-token' },
    });
    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken: 'refresh-token' },
    });
    const unauthorized = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    const current = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: 'Bearer access-token' },
    });

    expect(refresh.statusCode).toBe(200);
    expect(logout.statusCode).toBe(204);
    expect(unauthorized.statusCode).toBe(401);
    expect(current.json()).toMatchObject({
      ...publicUser,
      createdAt: publicUser.createdAt.toISOString(),
    });
  });
});
