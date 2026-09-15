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
    credentials: false,
  };
}
