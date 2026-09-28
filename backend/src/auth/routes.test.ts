import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import { csrfHeaderValue } from './cookies.js';
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    // The refresh token travels in the httpOnly cookie only: it must never
    // appear in a JSON body where same-origin scripts could read it.
    for (const response of [register, login]) {
      expect(response.json()).not.toHaveProperty('refreshToken');
      const cookie = response.headers['set-cookie'];
      expect(String(cookie)).toContain('testopia_refresh=refresh-token');
      expect(String(cookie)).toContain('HttpOnly');
      expect(String(cookie)).toContain('SameSite=Lax');
    }
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
    const headers = {
      cookie: 'testopia_refresh=refresh-token',
      'x-requested-with': csrfHeaderValue,
    };
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers,
    });
    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers,
    });
    const unauthorized = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    const current = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/current-user',
      headers: { authorization: 'Bearer access-token' },
    });

    expect(service.refresh).toHaveBeenCalledWith('refresh-token');
    expect(service.logout).toHaveBeenCalledWith('refresh-token');
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json()).not.toHaveProperty('refreshToken');
    expect(String(refresh.headers['set-cookie'])).toContain('testopia_refresh=');
    expect(logout.statusCode).toBe(204);
    expect(unauthorized.statusCode).toBe(401);
    expect(current.json()).toMatchObject({
      ...publicUser,
      createdAt: publicUser.createdAt.toISOString(),
    });
  });

  it('rejects cookie-authenticated calls without the CSRF header or cookie', async () => {
    const noHeader = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { testopia_refresh: 'refresh-token' },
    });
    const noCookie = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'x-requested-with': csrfHeaderValue },
    });
    const noHeaderLogout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { testopia_refresh: 'refresh-token' },
    });

    for (const response of [noHeader, noCookie, noHeaderLogout]) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: 'UNAUTHORIZED' });
    }
    expect(service.refresh).not.toHaveBeenCalledWith('refresh-token');

    // Logout without a cookie stays a 204: logging out twice is idempotent.
    const bareLogout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { 'x-requested-with': csrfHeaderValue },
    });
    expect(bareLogout.statusCode).toBe(204);
  });

  it('returns 403 when a regular user reaches an admin-only route', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/admin/current-user',
      headers: { authorization: 'Bearer access-token' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'FORBIDDEN' });
  });
});
