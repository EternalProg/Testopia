import { loginSchema, registerSchema, type User } from '@testopia/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  clearRefreshCookie,
  readLogoutCookie,
  requireRefreshCookie,
  setRefreshCookie,
} from './cookies.js';
import { AuthError } from './errors.js';
import type { AuthService } from './service.js';

type Session = Awaited<ReturnType<AuthService['login']>>;

// The refresh token travels in the httpOnly cookie only: it must never
// appear in a JSON body, where any same-origin script could read it.
function publicSession({ refreshToken: _refreshToken, ...session }: Session) {
  return session;
}

export function createAuthController(service: AuthService) {
  return {
    register: async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await service.register(registerSchema.parse(request.body));
      setRefreshCookie(reply, session.refreshToken, session.refreshTokenExpiresAt);
      return reply.code(201).send(publicSession(session));
    },
    login: async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await service.login(loginSchema.parse(request.body));
      setRefreshCookie(reply, session.refreshToken, session.refreshTokenExpiresAt);
      return reply.send(publicSession(session));
    },
    refresh: async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await service.refresh(requireRefreshCookie(request));
      setRefreshCookie(reply, session.refreshToken, session.refreshTokenExpiresAt);
      return reply.send(publicSession(session));
    },
    logout: async (request: FastifyRequest, reply: FastifyReply) => {
      const refreshToken = readLogoutCookie(request);
      if (refreshToken) await service.logout(refreshToken);
      clearRefreshCookie(reply);
      return reply.code(204).send();
    },
    currentUser: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.authUser) throw new AuthError('Authentication required', 'UNAUTHORIZED');
      const user: User = await service.currentUser(request.authUser.id);
      return reply.send(user);
    },
  };
}
