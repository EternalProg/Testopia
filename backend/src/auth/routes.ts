import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import { createAuthController } from './controllers.js';
import { authenticationGuard, roleGuard } from './guards.js';
import type { AuthService } from './service.js';
import type { TokenService } from './tokens.js';
import type { Database } from '../db/client.js';
import { authRateLimitConfig } from '../plugins/security.js';

export interface AuthRouteOptions {
  service: AuthService;
  tokens: TokenService;
  database?: Database;
}

const bearerSecurity = { security: [{ bearerAuth: [] }] };

const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, options) => {
  const controller = createAuthController(options.service);
  const authenticate = authenticationGuard(options.tokens);
  const authenticateAdmin = [authenticate, roleGuard('admin')];
  // Brute-force sensitive: every auth endpoint shares the stricter
  // per-route rate-limit bucket (docs schemas below are metadata only and
  // add no Fastify validation; Zod parsing stays in the controllers).
  const rateLimit = { config: authRateLimitConfig() };

  app.post(
    '/api/v1/auth/register',
    {
      ...rateLimit,
      schema: { description: 'Register a new user account.', tags: ['auth'] },
    },
    controller.register,
  );
  app.post(
    '/api/v1/auth/login',
    {
      ...rateLimit,
      schema: { description: 'Log in with email and password.', tags: ['auth'] },
    },
    controller.login,
  );
  app.post(
    '/api/v1/auth/refresh',
    {
      ...rateLimit,
      schema: { description: 'Rotate a refresh token for a new session.', tags: ['auth'] },
    },
    controller.refresh,
  );
  app.post(
    '/api/v1/auth/logout',
    {
      ...rateLimit,
      schema: { description: 'Revoke a refresh token (log out).', tags: ['auth'] },
    },
    controller.logout,
  );
  app.get(
    '/api/v1/auth/me',
    {
      ...rateLimit,
      onRequest: authenticate,
      schema: {
        description: 'Return the currently authenticated user.',
        tags: ['auth'],
        ...bearerSecurity,
      },
    },
    controller.currentUser,
  );
  app.get(
    '/api/v1/auth/current-user',
    {
      ...rateLimit,
      onRequest: authenticate,
      schema: {
        description: 'Alias of /auth/me: return the currently authenticated user.',
        tags: ['auth'],
        ...bearerSecurity,
      },
    },
    controller.currentUser,
  );
  app.get(
    '/api/v1/auth/admin/current-user',
    {
      ...rateLimit,
      onRequest: authenticateAdmin,
      schema: {
        description: 'Return the currently authenticated admin user (admin-only).',
        tags: ['auth'],
        ...bearerSecurity,
      },
    },
    controller.currentUser,
  );
};

export default fp(authRoutes, { name: 'auth-routes' });
