import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import { authenticationGuard, roleGuard } from '../auth/guards.js';
import type { TokenService } from '../auth/tokens.js';
import type { Database } from '../db/client.js';
import { UsersRepository } from '../repositories/users.repository.js';
import { createAdminController } from './controllers.js';
import { AdminService } from './service.js';

export interface AdminRouteOptions {
  db: Database;
  tokens: TokenService;
  service?: AdminService;
}

const bearerSecurity = { security: [{ bearerAuth: [] }] };

const adminRoutes: FastifyPluginAsync<AdminRouteOptions> = async (app, options) => {
  const service = options.service ?? new AdminService(new UsersRepository(options.db));
  const controller = createAdminController(service);
  // Admin-only, but not brute-force sensitive: role changes need no stricter
  // rate-limit bucket than the global one.
  const authenticateAdmin = [authenticationGuard(options.tokens), roleGuard('admin')];

  app.get(
    '/api/v1/admin/users',
    {
      onRequest: authenticateAdmin,
      // Docs-only metadata (no validation schemas): runtime behavior unchanged.
      schema: {
        description: 'List every user with id, email, username, role, and creation date.',
        tags: ['admin'],
        ...bearerSecurity,
      },
    },
    controller.listUsers,
  );

  app.patch<{ Params: { id: string } }>(
    '/api/v1/admin/users/:id/role',
    {
      onRequest: authenticateAdmin,
      schema: {
        description: "Change a user's role (admins cannot change their own).",
        tags: ['admin'],
        ...bearerSecurity,
      },
    },
    controller.setUserRole,
  );
};

export default fp(adminRoutes, { name: 'admin-routes' });
