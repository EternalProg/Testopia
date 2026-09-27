import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import { authenticationGuard, optionalAuthenticationGuard } from '../auth/guards.js';
import type { Database } from '../db/client.js';
import { TestsRepository } from '../repositories/tests.repository.js';
import { createTestsController } from './controllers.js';
import { TestsService } from './service.js';
import type { TokenService } from '../auth/tokens.js';

export interface TestsRouteOptions {
  db: Database;
  tokens: TokenService;
  service?: TestsService;
}

const bearerSecurity = { security: [{ bearerAuth: [] }] };
// Browsable anonymously but accepts a token (used for scope=mine/all and
// draft visibility): documented as optional auth.
const optionalBearerSecurity = { security: [{ bearerAuth: [] }, {}] };

const testsRoutes: FastifyPluginAsync<TestsRouteOptions> = async (app, options) => {
  const service = options.service ?? new TestsService(new TestsRepository(options.db));
  const controller = createTestsController(service);
  const authenticate = authenticationGuard(options.tokens);
  const optionalAuthenticate = optionalAuthenticationGuard(options.tokens);

  // Route `schema` entries below are docs-only metadata (description/tags/
  // security). No body/querystring/response validation schemas are added so
  // Fastify behavior is unchanged; Zod parsing stays in the controllers.

  app.get(
    '/api/v1/tests',
    {
      onRequest: optionalAuthenticate,
      schema: {
        description:
          'List published tests (scope=mine/all adds authenticated views; q searches titles and descriptions, category/difficulty filter; sort=newest|popular|hardest; ?page= opts into the { items, page, pageSize, total } envelope, pageSize capped at 100).',
        tags: ['tests'],
        ...optionalBearerSecurity,
      },
    },
    controller.list,
  );
  app.post(
    '/api/v1/tests',
    {
      onRequest: authenticate,
      schema: {
        description: 'Create a new draft test.',
        tags: ['tests'],
        ...bearerSecurity,
      },
    },
    controller.create,
  );
  app.get<{ Params: { id: string } }>(
    '/api/v1/tests/:id',
    {
      onRequest: optionalAuthenticate,
      schema: {
        description: 'Get a test by id (drafts are 404-masked from non-managers).',
        tags: ['tests'],
        ...optionalBearerSecurity,
      },
    },
    controller.get,
  );
  app.patch<{ Params: { id: string } }>(
    '/api/v1/tests/:id',
    {
      onRequest: authenticate,
      schema: {
        description: 'Update a test (author-or-admin).',
        tags: ['tests'],
        ...bearerSecurity,
      },
    },
    controller.update,
  );
  app.delete<{ Params: { id: string } }>(
    '/api/v1/tests/:id',
    {
      onRequest: authenticate,
      schema: {
        description: 'Delete a test (author-or-admin).',
        tags: ['tests'],
        ...bearerSecurity,
      },
    },
    controller.remove,
  );
  app.post<{ Params: { id: string } }>(
    '/api/v1/tests/:id/publish',
    {
      onRequest: authenticate,
      schema: {
        description: 'Publish a test (author-or-admin).',
        tags: ['tests'],
        ...bearerSecurity,
      },
    },
    controller.publish,
  );
  app.post<{ Params: { id: string } }>(
    '/api/v1/tests/:id/unpublish',
    {
      onRequest: authenticate,
      schema: {
        description: 'Unpublish a test (author-or-admin).',
        tags: ['tests'],
        ...bearerSecurity,
      },
    },
    controller.unpublish,
  );
  app.post<{ Params: { id: string } }>(
    '/api/v1/tests/:id/questions',
    {
      onRequest: authenticate,
      schema: {
        description: 'Add a question to a test (author-or-admin).',
        tags: ['tests'],
        ...bearerSecurity,
      },
    },
    controller.createQuestion,
  );
  app.patch<{ Params: { id: string; questionId: string } }>(
    '/api/v1/tests/:id/questions/:questionId',
    {
      onRequest: authenticate,
      schema: {
        description: 'Update a question (author-or-admin).',
        tags: ['tests'],
        ...bearerSecurity,
      },
    },
    controller.updateQuestion,
  );
  app.delete<{ Params: { id: string; questionId: string } }>(
    '/api/v1/tests/:id/questions/:questionId',
    {
      onRequest: authenticate,
      schema: {
        description: 'Delete a question (author-or-admin).',
        tags: ['tests'],
        ...bearerSecurity,
      },
    },
    controller.removeQuestion,
  );
};

export default fp(testsRoutes, { name: 'tests-routes' });
