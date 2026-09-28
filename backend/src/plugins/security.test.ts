import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { AuthService } from '../auth/service.js';
import type { TokenService } from '../auth/tokens.js';
import { getCorsOptions } from '../cors.js';
import type { Database } from '../db/client.js';
import type { RedisClient } from '../redis/client.js';
import securityPlugin from './security.js';

function stubTokens() {
  return {
    verifyAccessToken: vi.fn().mockResolvedValue({ sub: '1', role: 'user', type: 'access' }),
  } as unknown as TokenService;
}

type RateLimitCallback = (error: Error | null, result?: [number, number]) => void;

// Minimal stand-in for the Redis client surface the bundled RedisStore uses:
// defineCommand registration plus the Lua-backed rateLimit command, backed by
// a Map so the test pins our wiring (store selection, key scoping, fail-open)
// without re-testing upstream Lua.
function countingRedis() {
  const counts = new Map<string, number>();
  return {
    defineCommand: vi.fn(),
    rateLimit(
      key: string,
      _timeWindow: number,
      _max: number,
      _continueExceeding: boolean,
      _exponentialBackoff: boolean,
      callback: RateLimitCallback,
    ) {
      const current = (counts.get(key) ?? 0) + 1;
      counts.set(key, current);
      callback(null, [current, 60_000]);
    },
  };
}

describe('security plugin', () => {
  const readyDb = { execute: vi.fn().mockResolvedValue([[], []]) } as unknown as Database;
  const app = buildApp({
    auth: { service: {} as AuthService, tokens: stubTokens(), database: readyDb },
  });

  beforeAll(async () => app.ready());
  afterAll(async () => app.close());

  it('serves /health unauthenticated', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('sets helmet security headers and hides the framework signature', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    // Public API with CORS consumers: cross-origin reads must stay allowed.
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('generates server-side request IDs, ignoring client-supplied values', async () => {
    const seen: string[] = [];
    const observed = buildApp();
    observed.addHook('onRequest', async (request) => {
      seen.push(request.id);
    });
    await observed.ready();
    try {
      const headers = { 'x-request-id': 'forged-id' };
      await observed.inject({ method: 'GET', url: '/health', headers });
      await observed.inject({ method: 'GET', url: '/health', headers });

      expect(seen).toHaveLength(2);
      for (const id of seen) {
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      }
      expect(seen[0]).not.toBe(seen[1]);
      expect(seen).not.toContain('forged-id');
    } finally {
      await observed.close();
    }
  });

  it('reports ready when the database answers SELECT 1', async () => {
    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(readyDb.execute).toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready' });
  });

  it('reports not-ready when the database fails SELECT 1', async () => {
    const failingDb = {
      execute: vi.fn().mockRejectedValue(new Error('down')),
    } as unknown as Database;
    const failing = buildApp({
      auth: { service: {} as AuthService, tokens: stubTokens(), database: failingDb },
    });
    await failing.ready();
    try {
      const response = await failing.inject({ method: 'GET', url: '/ready' });

      expect(failingDb.execute).toHaveBeenCalled();
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ error: 'NOT_READY' });
    } finally {
      await failing.close();
    }
  });

  it('reports not-ready without a database (unit-test branch)', async () => {
    const bare = buildApp();
    await bare.ready();
    try {
      const response = await bare.inject({ method: 'GET', url: '/ready' });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ error: 'NOT_READY' });
    } finally {
      await bare.close();
    }
  });

  it('rejects oversized JSON bodies with 413', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'user@example.com', password: `x`.repeat(2 * 1024 * 1024) },
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
  });

  it('rejects wildcard CORS configuration', () => {
    expect(() => getCorsOptions('*')).toThrow('explicit origins');
  });

  it('rate-limits burst traffic with a RATE_LIMITED 429', async () => {
    const previous = process.env.RATE_LIMIT_MAX;
    process.env.RATE_LIMIT_MAX = '3';
    const limited = buildApp();
    await limited.ready();
    try {
      for (let index = 0; index < 3; index += 1) {
        const response = await limited.inject({ method: 'GET', url: '/health' });
        expect(response.statusCode).toBe(200);
      }
      const throttled = await limited.inject({ method: 'GET', url: '/health' });

      expect(throttled.statusCode).toBe(429);
      expect(throttled.json()).toMatchObject({ error: 'RATE_LIMITED' });
    } finally {
      await limited.close();
      if (previous === undefined) delete process.env.RATE_LIMIT_MAX;
      else process.env.RATE_LIMIT_MAX = previous;
    }
  });

  it('applies a stricter bucket to auth routes without touching other routes', async () => {
    const previous = process.env.RATE_LIMIT_AUTH_MAX;
    process.env.RATE_LIMIT_AUTH_MAX = '2';
    const burglar = buildApp({ auth: { service: {} as AuthService, tokens: stubTokens() } });
    await burglar.ready();
    try {
      const login = { email: 'user@example.com', password: 'password123' };
      for (let index = 0; index < 2; index += 1) {
        const response = await burglar.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: login,
        });
        expect(response.statusCode).not.toBe(429);
      }
      const throttled = await burglar.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: login,
      });

      expect(throttled.statusCode).toBe(429);
      expect(throttled.json()).toMatchObject({ error: 'RATE_LIMITED' });

      const health = await burglar.inject({ method: 'GET', url: '/health' });
      expect(health.statusCode).toBe(200);
    } finally {
      await burglar.close();
      if (previous === undefined) delete process.env.RATE_LIMIT_AUTH_MAX;
      else process.env.RATE_LIMIT_AUTH_MAX = previous;
    }
  });

  it('shares the rate-limit budget across instances through Redis', async () => {
    const previous = process.env.RATE_LIMIT_MAX;
    process.env.RATE_LIMIT_MAX = '2';
    const redis = countingRedis();
    // Routes must be added after the security plugin loads: the limiter
    // wires itself through an onRoute hook, so earlier routes stay unlimited.
    const first = Fastify();
    await first.register(securityPlugin, { redis: redis as unknown as RedisClient });
    first.get('/ping', async () => ({ ok: true }));
    const second = Fastify();
    await second.register(securityPlugin, { redis: redis as unknown as RedisClient });
    second.get('/ping', async () => ({ ok: true }));
    await first.ready();
    await second.ready();
    try {
      // Two requests through the first instance consume the shared budget...
      expect((await first.inject({ method: 'GET', url: '/ping' })).statusCode).toBe(200);
      expect((await first.inject({ method: 'GET', url: '/ping' })).statusCode).toBe(200);
      // ...so the second instance, never seen before, is already throttled.
      // (The RATE_LIMITED error shape is pinned by the buildApp tests above;
      // this bare instance lacks the app error handler.)
      const throttled = await second.inject({ method: 'GET', url: '/ping' });

      expect(throttled.statusCode).toBe(429);
    } finally {
      await first.close();
      await second.close();
      if (previous === undefined) delete process.env.RATE_LIMIT_MAX;
      else process.env.RATE_LIMIT_MAX = previous;
    }
  });

  it('allows traffic when the Redis store errors', async () => {
    const previous = process.env.RATE_LIMIT_MAX;
    process.env.RATE_LIMIT_MAX = '1';
    const failing = {
      defineCommand: vi.fn(),
      rateLimit(
        _key: string,
        _timeWindow: number,
        _max: number,
        _continueExceeding: boolean,
        _exponentialBackoff: boolean,
        callback: RateLimitCallback,
      ) {
        callback(new Error('redis down'));
      },
    };
    const app = Fastify();
    await app.register(securityPlugin, { redis: failing as unknown as RedisClient });
    app.get('/ping', async () => ({ ok: true }));
    await app.ready();
    try {
      // A Redis outage must not become an outage: every request passes.
      for (let index = 0; index < 3; index += 1) {
        expect((await app.inject({ method: 'GET', url: '/ping' })).statusCode).toBe(200);
      }
    } finally {
      await app.close();
      if (previous === undefined) delete process.env.RATE_LIMIT_MAX;
      else process.env.RATE_LIMIT_MAX = previous;
    }
  });
});
