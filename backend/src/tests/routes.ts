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
}

const testsRoutes: FastifyPluginAsync<TestsRouteOptions> = async (app, options) => {
  const controller = createTestsController(new TestsService(new TestsRepository(options.db)));
  const authenticate = authenticationGuard(options.tokens);
  const optionalAuthenticate = optionalAuthenticationGuard(options.tokens);

  app.get('/api/v1/tests', { onRequest: optionalAuthenticate }, controller.list);
  app.post('/api/v1/tests', { onRequest: authenticate }, controller.create);
  app.get<{ Params: { id: string } }>(
    '/api/v1/tests/:id',
    { onRequest: optionalAuthenticate },
    controller.get,
  );
  app.patch<{ Params: { id: string } }>(
    '/api/v1/tests/:id',
    { onRequest: authenticate },
    controller.update,
  );
  app.delete<{ Params: { id: string } }>(
    '/api/v1/tests/:id',
    { onRequest: authenticate },
    controller.remove,
  );
  app.post<{ Params: { id: string } }>(
    '/api/v1/tests/:id/publish',
    { onRequest: authenticate },
    controller.publish,
  );
  app.post<{ Params: { id: string } }>(
    '/api/v1/tests/:id/unpublish',
    { onRequest: authenticate },
    controller.unpublish,
  );
  app.post<{ Params: { id: string } }>(
    '/api/v1/tests/:id/questions',
    { onRequest: authenticate },
    controller.createQuestion,
  );
  app.patch<{ Params: { id: string; questionId: string } }>(
    '/api/v1/tests/:id/questions/:questionId',
    { onRequest: authenticate },
    controller.updateQuestion,
  );
  app.delete<{ Params: { id: string; questionId: string } }>(
    '/api/v1/tests/:id/questions/:questionId',
    { onRequest: authenticate },
    controller.removeQuestion,
  );
};

export default fp(testsRoutes, { name: 'tests-routes' });
