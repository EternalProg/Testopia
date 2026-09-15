import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import { createAuthController } from './controllers.js';
import { authenticationGuard, roleGuard } from './guards.js';
import type { AuthService } from './service.js';
import type { TokenService } from './tokens.js';
import type { Database } from '../db/client.js';

export interface AuthRouteOptions {
  service: AuthService;
  tokens: TokenService;
  database?: Database;
}

const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, options) => {
  const controller = createAuthController(options.service);
  const authenticate = authenticationGuard(options.tokens);
  const authenticateAdmin = [authenticate, roleGuard('admin')];

  app.post('/api/v1/auth/register', controller.register);
  app.post('/api/v1/auth/login', controller.login);
  app.post('/api/v1/auth/refresh', controller.refresh);
  app.post('/api/v1/auth/logout', controller.logout);
  app.get('/api/v1/auth/me', { onRequest: authenticate }, controller.currentUser);
  app.get('/api/v1/auth/current-user', { onRequest: authenticate }, controller.currentUser);
  app.get(
    '/api/v1/auth/admin/current-user',
    { onRequest: authenticateAdmin },
    controller.currentUser,
  );
};

export default fp(authRoutes, { name: 'auth-routes' });
