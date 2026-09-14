import type { FastifyReply, FastifyRequest } from 'fastify';

import type { UserRole } from '@practice-works/shared';

import { AuthError } from './errors.js';
import type { TokenService } from './tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: { id: number; role: UserRole };
  }
}

export function authenticationGuard(tokens: TokenService) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new AuthError('Authentication required', 'UNAUTHORIZED');
    }

    try {
      const payload = await tokens.verifyAccessToken(authorization.slice('Bearer '.length));
      const id = Number(payload.sub);
      if (!Number.isSafeInteger(id) || id <= 0 || !['user', 'admin'].includes(payload.role)) {
        throw new Error('Invalid identity');
      }
      request.authUser = { id, role: payload.role };
    } catch {
      throw new AuthError('Authentication required', 'UNAUTHORIZED');
    }
  };
}

export function roleGuard(role: UserRole) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (request.authUser?.role !== role) {
      throw new AuthError('Insufficient permissions', 'UNAUTHORIZED');
    }
  };
}
