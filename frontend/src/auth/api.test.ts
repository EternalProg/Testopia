import { afterEach, describe, expect, it, vi } from 'vitest';

import { authApi, shouldIncludeCredentials } from './api.js';
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
