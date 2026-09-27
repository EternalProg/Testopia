import { userRoleSchema } from '@testopia/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AuthError } from '../auth/errors.js';
import { AdminError } from './errors.js';
import type { AdminService } from './service.js';

type IdParams = { id: string };

// Reuses the shared role enum so the admin panel can never assign a role the
// users table does not know. A parse failure raises ZodError, which the app
// error handler maps to 400 VALIDATION_ERROR.
const roleUpdateSchema = z.object({ role: userRoleSchema });

function id(value: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new AdminError('Invalid id', 'VALIDATION_ERROR');
  }
  return parsed;
}

function actor(request: FastifyRequest) {
  if (!request.authUser) throw new AuthError('Authentication required', 'UNAUTHORIZED');
  return request.authUser;
}

export function createAdminController(service: AdminService) {
  return {
    listUsers: async (request: FastifyRequest, reply: FastifyReply) => {
      actor(request);
      return reply.send(await service.listUsers());
    },
    setUserRole: async (request: FastifyRequest<{ Params: IdParams }>, reply: FastifyReply) => {
      const user = request.authUser;
      if (!user) throw new AuthError('Authentication required', 'UNAUTHORIZED');
      const { role } = roleUpdateSchema.parse(request.body);
      return reply.send(await service.setUserRole(user, id(request.params.id), role));
    },
  };
}
