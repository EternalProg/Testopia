import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthError } from './errors.js';

/** Refresh sessions ride an httpOnly cookie, never a readable store. */
export const refreshCookieName = 'testopia_refresh';

/**
 * Client-set header required on every cookie-authenticated POST. Cross-site
 * simple requests (plain forms, img tags) cannot set custom headers — the
 * CORS preflight would block them — so its presence proves the call came
 * from script running on an allowed origin, which is what makes trusting the
 * ambient cookie safe.
 */
export const csrfHeaderName = 'x-requested-with';
export const csrfHeaderValue = 'XMLHttpRequest';

/** Seconds until `expiresAt`, floored at zero for already-dead sessions. */
export function refreshCookieMaxAgeSeconds(expiresAt: Date, now = new Date()): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}

export function refreshCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // No TLS terminator ships in this repo, so Secure stays opt-in:
    // COOKIE_SECURE=1 wherever browsers reach the API over https.
    secure: process.env.COOKIE_SECURE === '1',
    path: '/api/v1/auth',
    maxAge: refreshCookieMaxAgeSeconds(expiresAt),
  };
}

export function setRefreshCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(refreshCookieName, token, refreshCookieOptions(expiresAt));
}

export function clearRefreshCookie(reply: FastifyReply): void {
  // Clearing must repeat the cookie path, otherwise the browser keeps the
  // scoped cookie and keeps sending it.
  reply.clearCookie(refreshCookieName, { path: '/api/v1/auth' });
}

function requireCsrfHeader(request: FastifyRequest): void {
  const header = request.headers[csrfHeaderName];
  if (header !== csrfHeaderValue) {
    throw new AuthError('Authentication required', 'UNAUTHORIZED');
  }
}

/** The session token for refresh: CSRF header plus a present cookie. */
export function requireRefreshCookie(request: FastifyRequest): string {
  requireCsrfHeader(request);
  const token = request.cookies?.[refreshCookieName];
  if (typeof token !== 'string' || token === '') {
    throw new AuthError('Authentication required', 'UNAUTHORIZED');
  }
  return token;
}

/**
 * The session token for logout, if any. The CSRF header is still required —
 * forged logouts are a nuisance attack — but a missing cookie is a 204, not
 * an error: logging out twice must stay idempotent.
 */
export function readLogoutCookie(request: FastifyRequest): string | null {
  requireCsrfHeader(request);
  const token = request.cookies?.[refreshCookieName];
  return typeof token === 'string' && token !== '' ? token : null;
}
