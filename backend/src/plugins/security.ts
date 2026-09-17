import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

const DEFAULT_GLOBAL_MAX = 300;
const DEFAULT_AUTH_MAX = 60;
const TIME_WINDOW = '1 minute';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Global per-IP request budget, read at registration time (env `RATE_LIMIT_MAX`). */
export function globalRateLimitMax(): number {
  return parsePositiveInt(process.env.RATE_LIMIT_MAX, DEFAULT_GLOBAL_MAX);
}

/** Stricter per-IP budget for the auth endpoints (env `RATE_LIMIT_AUTH_MAX`). */
export function authRateLimitMax(): number {
  return parsePositiveInt(process.env.RATE_LIMIT_AUTH_MAX, DEFAULT_AUTH_MAX);
}

/** Route-level `config` override that puts a route into the stricter auth bucket. */
export function authRateLimitConfig() {
  return { rateLimit: { max: authRateLimitMax(), timeWindow: TIME_WINDOW } };
}

const securityPlugin: FastifyPluginAsync = async (app) => {
  await app.register(helmet, {
    // This is a public API server by CORS design (CORS_ORIGIN allowlist), so
    // cross-origin API consumers must be readable: helmet's default
    // same-origin resource policy would block their CORS-allowed fetches.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  await app.register(rateLimit, {
    max: globalRateLimitMax(),
    timeWindow: TIME_WINDOW,
  });
};

export default fp(securityPlugin, { name: 'security' });
