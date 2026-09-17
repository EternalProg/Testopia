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

const attemptsRoutes: FastifyPluginAsync<AttemptsRouteOptions> = async (app, options) => {
  const service =
    options.service ??
    new AttemptsService(new TestsRepository(options.db), new AttemptsRepository(options.db));
  const controller = createAttemptsController(service);
  const authenticate = authenticationGuard(options.tokens);

  app.post<{ Params: { id: string } }>(
    '/api/v1/tests/:id/attempts',
    { onRequest: authenticate },
    controller.startAttempt,
  );
  app.get<{ Params: { id: string } }>(
    '/api/v1/attempts/:id',
    { onRequest: authenticate },
    controller.getAttempt,
  );
  app.get<{ Params: { id: string } }>(
    '/api/v1/attempts/:id/result',
    { onRequest: authenticate },
    controller.getResult,
  );
  app.get<{ Params: { id: string } }>(
    '/api/v1/tests/:id/attempts',
    { onRequest: authenticate },
    controller.listHistory,
  );
  app.post<{ Params: { id: string } }>(
    '/api/v1/attempts/:id/submit',
    { onRequest: authenticate },
    controller.submitAttempt,
  );
};

export default fp(attemptsRoutes, { name: 'attempts-routes' });
