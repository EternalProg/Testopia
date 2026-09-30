import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, authApi, shouldIncludeCredentials } from './api.js';
import { session } from '../test/mocks.js';

afterEach(() => {
  vi.unstubAllGlobals();
  authApi.clearAccessToken();
});

describe('auth request credentials', () => {
  it('sends cookies on auth paths and same-origin requests only', () => {
    expect(shouldIncludeCredentials('/api/v1/auth/refresh', 'https://api.example.com')).toBe(true);
    expect(shouldIncludeCredentials('/api/v1/auth/logout', 'https://api.example.com')).toBe(true);
    expect(shouldIncludeCredentials('/api/v1/auth/me', '')).toBe(true);
    expect(shouldIncludeCredentials('/api/v1/tests', '')).toBe(true);
    expect(shouldIncludeCredentials('/api/v1/tests', 'https://api.example.com')).toBe(false);
  });

  it('keeps the cookie flow on refresh and logout', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/api/v1/auth/logout')) {
        return Promise.resolve({ ok: true, status: 204, json: async () => undefined });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => session });
    });
    vi.stubGlobal('fetch', fetchMock);

    await authApi.refresh();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/refresh'),
      expect.objectContaining({ credentials: 'include' }),
    );

    await authApi.logout();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/logout'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });
});

describe('auth request errors', () => {
  it('keeps the HTTP status when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      }),
    );

    const error = await authApi
      .login({ email: 'a@example.com', password: 'x'.repeat(12) })
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
    expect((error as ApiError).message).toBe('Не вдалося виконати запит (502)');
  });

  it('prefers the server message when the error body is JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }),
      }),
    );

    const error = await authApi
      .login({ email: 'a@example.com', password: 'x'.repeat(12) })
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('Invalid email or password');
  });
});
