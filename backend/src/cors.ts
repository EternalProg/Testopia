import type { FastifyCorsOptions } from '@fastify/cors';

export function getCorsOptions(value = process.env.CORS_ORIGIN): FastifyCorsOptions {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.includes('*')) {
    throw new Error('CORS_ORIGIN must contain explicit origins, not a wildcard');
  }

  return {
    origin: origins.length > 0 ? origins : false,
    // Required so browsers send the httpOnly refresh cookie (same-origin in
    // production, cross-origin in local dev). Safe with the explicit-origin
    // allowlist enforced above: credentials and wildcard origins are mutually
    // exclusive by spec.
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    // X-Requested-With is the CSRF header cookie-authenticated auth
    // endpoints require; it must be allowlisted for cross-origin preflight.
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Requested-With'],
  };
}
