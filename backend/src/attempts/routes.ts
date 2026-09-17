import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import { authenticationGuard } from '../auth/guards.js';
import type { TokenService } from '../auth/tokens.js';
import type { Database } from '../db/client.js';
import { AttemptsRepository } from '../repositories/attempts.repository.js';
import { TestsRepository } from '../repositories/tests.repository.js';
import { createAttemptsController } from './controllers.js';
import { AttemptsService } from './service.js';

export interface AttemptsRouteOptions {
  db: Database;
  tokens: TokenService;
  service?: AttemptsService;
}

const bearerSecurity = { security: [{ bearerAuth: [] }] };

const attemptsRoutes: FastifyPluginAsync<AttemptsRouteOptions> = async (app, options) => {
  const service =
    options.service ??
    new AttemptsService(new TestsRepository(options.db), new AttemptsRepository(options.db));
  const controller = createAttemptsController(service);
  const authenticate = authenticationGuard(options.tokens);

  // Route `schema` entries are docs-only metadata (no validation schemas),
  // so Fastify runtime behavior is unchanged.

  app.post<{ Params: { id: string } }>(
    '/api/v1/tests/:id/attempts',
    {
      onRequest: authenticate,
      schema: {
        description: 'Start (or resume) an attempt for a published test.',
        tags: ['attempts'],
        ...bearerSecurity,
      },
    },
    controller.startAttempt,
  );
  app.get<{ Params: { id: string } }>(
    '/api/v1/attempts/:id',
    {
      onRequest: authenticate,
      schema: {
        description: 'Get an attempt by id (owner-or-admin).',
        tags: ['attempts'],
        ...bearerSecurity,
      },
    },
    controller.getAttempt,
  );
  app.get<{ Params: { id: string } }>(
    '/api/v1/attempts/:id/result',
    {
      onRequest: authenticate,
      schema: {
        description: 'Get the result of a finished attempt (owner-or-admin).',
        tags: ['attempts'],
        ...bearerSecurity,
      },
    },
    controller.getResult,
  );
  app.get<{ Params: { id: string } }>(
    '/api/v1/tests/:id/attempts',
    {
      onRequest: authenticate,
      schema: {
        description: 'List attempt history (managers see all, takers see their own).',
        tags: ['attempts'],
        ...bearerSecurity,
      },
    },
    controller.listHistory,
  );
  app.post<{ Params: { id: string } }>(
    '/api/v1/attempts/:id/submit',
    {
      onRequest: authenticate,
      schema: {
        description: 'Submit answers for an attempt (owner-or-admin).',
        tags: ['attempts'],
        ...bearerSecurity,
      },
    },
    controller.submitAttempt,
  );
};

export default fp(attemptsRoutes, { name: 'attempts-routes' });
