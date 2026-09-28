import type { LoginInput, RegisterInput, User } from '@testopia/shared';

import type { ApiErrorPayload, Session } from './types.js';
import { adminApi } from '../admin/api.js';
import { attemptsApi } from '../attempts/api.js';
import { statisticsApi } from '../statistics/api.js';
import { testsApi } from '../tests/api.js';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
let accessToken: string | null = null;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: ApiErrorPayload,
  ) {
    super(payload.message ?? payload.error ?? 'Request failed');
    this.name = 'ApiError';
  }
}

function toUser(user: User & { createdAt: string }): User {
  return { ...user, createdAt: new Date(user.createdAt) };
}

function toSession(
  session: Omit<Session, 'user'> & { user: User & { createdAt: string } },
): Session {
  return { ...session, user: toUser(session.user) };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  // The refresh session rides an httpOnly cookie: include credentials so the
  // browser sends it (same-origin in production, cross-origin in local dev).
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // Keep the HTTP status when the server has no JSON error body.
    }
    throw new ApiError(response.status, payload);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function storeSession(session: Session): Session {
  accessToken = session.accessToken;
  testsApi.setAccessToken(session.accessToken);
  attemptsApi.setAccessToken(session.accessToken);
  statisticsApi.setAccessToken(session.accessToken);
  adminApi.setAccessToken(session.accessToken);
  return session;
}

// Cookie-authenticated endpoints require a client-set header that cross-site
// simple requests cannot forge; the server rejects refresh/logout without it.
function csrfHeaders(): Record<string, string> {
  return { 'X-Requested-With': 'XMLHttpRequest' };
}

export const authApi = {
  async register(input: RegisterInput): Promise<Session> {
    return storeSession(
      toSession(
        await request('/api/v1/auth/register', {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      ),
    );
  },
  async login(input: LoginInput): Promise<Session> {
    return storeSession(
      toSession(
        await request('/api/v1/auth/login', {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      ),
    );
  },
  async refresh(): Promise<Session> {
    return storeSession(
      toSession(
        await request('/api/v1/auth/refresh', {
          method: 'POST',
          headers: csrfHeaders(),
        }),
      ),
    );
  },
  async logout(): Promise<void> {
    try {
      await request('/api/v1/auth/logout', {
        method: 'POST',
        headers: csrfHeaders(),
      });
    } finally {
      accessToken = null;
      testsApi.setAccessToken(null);
      attemptsApi.setAccessToken(null);
      statisticsApi.setAccessToken(null);
      adminApi.setAccessToken(null);
    }
  },
  async me(): Promise<User> {
    return toUser(await request('/api/v1/auth/me'));
  },
  clearAccessToken(): void {
    accessToken = null;
    testsApi.setAccessToken(null);
    attemptsApi.setAccessToken(null);
    statisticsApi.setAccessToken(null);
    adminApi.setAccessToken(null);
  },
};
