import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import {
  clearRefreshCookie,
  csrfHeaderValue,
  readLogoutCookie,
  refreshCookieMaxAgeSeconds,
  refreshCookieName,
  refreshCookieOptions,
  requireRefreshCookie,
  setRefreshCookie,
} from './cookies.js';

function request(
  headers: Record<string, string | undefined> = {},
  cookies: Record<string, string> | undefined = undefined,
): FastifyRequest {
  return { headers, cookies } as unknown as FastifyRequest;
}

function csrfHeaders(): Record<string, string> {
  return { 'x-requested-with': csrfHeaderValue };
}

describe('refresh cookies', () => {
  it('scopes the cookie to auth endpoints with httpOnly and lax same-site', () => {
    const expiresAt = new Date(Date.now() + 60_000);

    expect(refreshCookieOptions(expiresAt)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/api/v1/auth',
      maxAge: 60,
    });
  });

  it('derives the cookie lifetime from the session expiry', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');

    expect(refreshCookieMaxAgeSeconds(new Date('2026-01-01T00:01:40.000Z'), now)).toBe(100);
    expect(refreshCookieMaxAgeSeconds(new Date('2025-12-31T23:59:00.000Z'), now)).toBe(0);
  });

  it('sets and clears the cookie on the same path', () => {
    const setCookie = vi.fn();
    const clearCookie = vi.fn();
    const reply = { setCookie, clearCookie } as unknown as FastifyReply;
    const expiresAt = new Date(Date.now() + 60_000);

    setRefreshCookie(reply, 'token', expiresAt);
    expect(setCookie).toHaveBeenCalledWith(
      refreshCookieName,
      'token',
      expect.objectContaining({ path: '/api/v1/auth' }),
    );

    clearRefreshCookie(reply);
    expect(clearCookie).toHaveBeenCalledWith(refreshCookieName, { path: '/api/v1/auth' });
  });

  it('reads the refresh cookie only with the CSRF header present', () => {
    expect(requireRefreshCookie(request(csrfHeaders(), { [refreshCookieName]: 'token' }))).toBe(
      'token',
    );

    expect(() => requireRefreshCookie(request({}, { [refreshCookieName]: 'token' }))).toThrow(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
    expect(() =>
      requireRefreshCookie(
        request({ 'x-requested-with': 'forged?' }, { [refreshCookieName]: 'x' }),
      ),
    ).toThrow(expect.objectContaining({ code: 'UNAUTHORIZED' }));
    expect(() => requireRefreshCookie(request(csrfHeaders(), {}))).toThrow(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
    expect(() => requireRefreshCookie(request(csrfHeaders()))).toThrow(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
  });

  it('lets logout through without a cookie but never without the header', () => {
    expect(readLogoutCookie(request(csrfHeaders(), { [refreshCookieName]: 'token' }))).toBe(
      'token',
    );
    expect(readLogoutCookie(request(csrfHeaders(), {}))).toBeNull();
    expect(readLogoutCookie(request(csrfHeaders()))).toBeNull();

    expect(() => readLogoutCookie(request({}, { [refreshCookieName]: 'token' }))).toThrow(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
  });
});
