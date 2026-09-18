import { loginSchema, refreshTokenSchema, registerSchema, type User } from '@testopia/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthError } from './errors.js';
import type { AuthService } from './service.js';

export function createAuthController(service: AuthService) {
  return {
    register: async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await service.register(registerSchema.parse(request.body));
      return reply.code(201).send(session);
    },
    login: async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await service.login(loginSchema.parse(request.body));
      return reply.send(session);
    },
    refresh: async (request: FastifyRequest, reply: FastifyReply) => {
      const { refreshToken } = refreshTokenSchema.parse(request.body);
      return reply.send(await service.refresh(refreshToken));
    },
    logout: async (request: FastifyRequest, reply: FastifyReply) => {
      const { refreshToken } = refreshTokenSchema.parse(request.body);
      await service.logout(refreshToken);
      return reply.code(204).send();
    },
    currentUser: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.authUser) throw new AuthError('Authentication required', 'UNAUTHORIZED');
      const user: User = await service.currentUser(request.authUser.id);
      return reply.send(user);
    },
  };
}
