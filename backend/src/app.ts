import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';

import { healthResponseSchema } from '@practice-works/shared';

import { AuthError } from './auth/errors.js';
import { PasswordTooLongError } from './auth/password.js';
import { createAuthServices } from './auth/factory.js';
import authRoutes from './auth/routes.js';
import type { AuthService } from './auth/service.js';
import type { TokenService } from './auth/tokens.js';
import { getCorsOptions } from './cors.js';
import databasePlugin from './plugins/database.js';
import testsRoutes from './tests/routes.js';
import { TestError } from './tests/errors.js';
import type { Database } from './db/client.js';

interface AppOptions {
  auth?: { service: AuthService; tokens: TokenService; database?: Database };
  corsOrigin?: string;
  database?: boolean;
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: true });
  app.register(cors, getCorsOptions(options.corsOrigin));

  app.get('/health', async () => healthResponseSchema.parse({ status: 'ok' }));

  if (options.auth) {
    app.register(authRoutes, options.auth);
    if (options.auth.database)
      app.register(testsRoutes, { db: options.auth.database, tokens: options.auth.tokens });
  } else if (options.database) {
    app.register(databasePlugin);
    app.register(async (instance) => {
      instance.register(authRoutes, createAuthServices(instance.db));
      instance.register(async (nested) => {
        const auth = createAuthServices(nested.db);
        nested.register(testsRoutes, { db: nested.db, tokens: auth.tokens });
      });
    });
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply
        .code(400)
        .send({ error: 'VALIDATION_ERROR', message: 'Request validation failed' });
    }
    if (error instanceof PasswordTooLongError) {
      return reply.code(400).send({ error: 'PASSWORD_TOO_LONG', message: error.message });
    }
    if (error instanceof AuthError) {
      const statusCode =
        error.code === 'EMAIL_TAKEN' ? 409 : error.code === 'FORBIDDEN' ? 403 : 401;
      return reply.code(statusCode).send({ error: error.code, message: error.message });
    }
    if (error instanceof TestError) {
      const statusCode =
        error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'FORBIDDEN'
            ? 403
            : error.code === 'CONFLICT'
              ? 409
              : 400;
      return reply.code(statusCode).send({ error: error.code, message: error.message });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  });

  return app;
}
