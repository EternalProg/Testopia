import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import { authenticationGuard } from '../auth/guards.js';
import type { TokenService } from '../auth/tokens.js';
import type { Database } from '../db/client.js';
import { StatisticsRepository } from '../repositories/statistics.repository.js';
import { TestsRepository } from '../repositories/tests.repository.js';
import { createStatisticsController } from './controllers.js';
import { StatisticsService } from './service.js';

export interface StatisticsRouteOptions {
  db: Database;
  tokens: TokenService;
  service?: StatisticsService;
}

const statisticsRoutes: FastifyPluginAsync<StatisticsRouteOptions> = async (app, options) => {
  const service =
    options.service ??
    new StatisticsService(new StatisticsRepository(options.db), new TestsRepository(options.db));
  const controller = createStatisticsController(service);
  const authenticate = authenticationGuard(options.tokens);

  app.get(
    '/api/v1/users/me/statistics',
    {
      onRequest: authenticate,
      // Docs-only metadata (no validation schemas): runtime behavior unchanged.
      schema: {
        description: 'Get aggregate statistics across all tests the current user took.',
        tags: ['statistics'],
        security: [{ bearerAuth: [] }],
      },
    },
    controller.getMyStatistics,
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/tests/:id/statistics',
    {
      onRequest: authenticate,
      // Docs-only metadata (no validation schemas): runtime behavior unchanged.
      schema: {
        description: 'Get aggregate statistics for a test (author-or-admin, drafts included).',
        tags: ['statistics'],
        security: [{ bearerAuth: [] }],
      },
    },
    controller.getStatistics,
  );
};

export default fp(statisticsRoutes, { name: 'statistics-routes' });
