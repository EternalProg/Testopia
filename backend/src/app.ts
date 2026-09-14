import Fastify, { type FastifyInstance } from 'fastify';

import { healthResponseSchema } from '@practice-works/shared';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.get('/health', async () => healthResponseSchema.parse({ status: 'ok' }));

  return app;
}
