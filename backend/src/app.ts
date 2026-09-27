import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { sql } from 'drizzle-orm';
import fp from 'fastify-plugin';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';

import { healthResponseSchema } from '@testopia/shared';

import { AuthError } from './auth/errors.js';
import { PasswordTooLongError } from './auth/password.js';
import { createAuthServices } from './auth/factory.js';
import authRoutes from './auth/routes.js';
import type { AuthService } from './auth/service.js';
import type { TokenService } from './auth/tokens.js';
import { getCorsOptions } from './cors.js';
import databasePlugin from './plugins/database.js';
import openapiPlugin from './plugins/openapi.js';
import securityPlugin from './plugins/security.js';
import attemptsRoutes from './attempts/routes.js';
import { AttemptError } from './attempts/errors.js';
import adminRoutes from './admin/routes.js';
import { AdminError } from './admin/errors.js';
import statisticsRoutes from './statistics/routes.js';
import { StatisticsError } from './statistics/errors.js';
import testsRoutes from './tests/routes.js';
import { TestError } from './tests/errors.js';
import type { Database } from './db/client.js';

interface AppOptions {
  auth?: { service: AuthService; tokens: TokenService; database?: Database };
  corsOrigin?: string;
  database?: boolean;
}

/** Explicit JSON body limit: oversized payloads are rejected with 413. */
export const BODY_LIMIT_BYTES = 1024 * 1024;

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    bodyLimit: BODY_LIMIT_BYTES,
    genReqId: () => randomUUID(),
    // No requestIdHeader: request IDs are always server-generated (an inbound
    // X-Request-Id is ignored) so clients cannot inject IDs into logs.
    // Trust X-Forwarded-For only behind a trusted ingress (docker compose
    // sets TRUST_PROXY=1 for its bundled nginx, which overwrites XFF with
    // the real client IP; tests do not set it). With trust-all, a directly
    // reachable backend would honor spoofed headers, so production
    // deployments must ensure clients cannot bypass the proxy.
    trustProxy: process.env.TRUST_PROXY === '1',
  });
  app.register(cors, getCorsOptions(options.corsOrigin));
  // Security headers + rate limits and OpenAPI docs apply to every branch
  // below (test auth branch, database branch, and bare instances), so they
  // are registered once at the root instead of per branch.
  app.register(securityPlugin);
  app.register(openapiPlugin);

  // NOTE: routes live in a child plugin registered AFTER the security and
  // docs plugins. @fastify/rate-limit wires limits through an `onRoute`
  // hook, which only sees routes defined after the plugin has finished
  // loading; defining routes at the root body would silently skip limiting
  // because buildApp is synchronous and plugin loading is deferred. The
  // container itself is fp-wrapped so the database decorator still lands on
  // the root instance (relied upon by app.database.test.ts).
  app.register(
    fp(async function applicationRoutes(instance) {
      instance.get(
        '/health',
        {
          schema: {
            description: 'Dependency-free liveness probe (no authentication).',
            tags: ['ops'],
          },
        },
        async () => healthResponseSchema.parse({ status: 'ok' }),
      );

      instance.get(
        '/ready',
        {
          schema: {
            description: 'Readiness probe: 200 when the database answers, else 503.',
            tags: ['ops'],
          },
        },
        async (_request, reply) => {
          // Readiness: the database must answer. The decorator is resolved per
          // request because the database plugin finishes loading after this
          // container is registered. Instances without a database (unit-test
          // branch) are deliberately reported as not ready.
          const database = options.auth?.database ?? (instance as unknown as { db?: Database }).db;
          if (!database) {
            return reply.code(503).send({ error: 'NOT_READY' });
          }
          try {
            await database.execute(sql`SELECT 1`);
            return reply.send({ status: 'ready' });
          } catch {
            return reply.code(503).send({ error: 'NOT_READY' });
          }
        },
      );

      if (options.auth) {
        instance.register(authRoutes, options.auth);
        if (options.auth.database) {
          instance.register(testsRoutes, {
            db: options.auth.database,
            tokens: options.auth.tokens,
          });
          instance.register(attemptsRoutes, {
            db: options.auth.database,
            tokens: options.auth.tokens,
          });
          instance.register(statisticsRoutes, {
            db: options.auth.database,
            tokens: options.auth.tokens,
          });
          instance.register(adminRoutes, {
            db: options.auth.database,
            tokens: options.auth.tokens,
          });
        }
      } else if (options.database) {
        instance.register(databasePlugin);
        instance.register(async (withDatabase) => {
          withDatabase.register(authRoutes, createAuthServices(withDatabase.db));
          withDatabase.register(async (nested) => {
            const auth = createAuthServices(nested.db);
            nested.register(testsRoutes, { db: nested.db, tokens: auth.tokens });
            nested.register(attemptsRoutes, { db: nested.db, tokens: auth.tokens });
            nested.register(statisticsRoutes, { db: nested.db, tokens: auth.tokens });
            nested.register(adminRoutes, { db: nested.db, tokens: auth.tokens });
          });
        });
      }
    }),
  );

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply
        .code(400)
        .send({ error: 'VALIDATION_ERROR', message: 'Request validation failed' });
    }
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (statusCode === 429) {
      return reply.code(429).send({ error: 'RATE_LIMITED', message: 'Rate limit exceeded' });
    }
    if (statusCode === 413) {
      return reply
        .code(413)
        .send({ error: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' });
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
    if (error instanceof StatisticsError) {
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
    if (error instanceof AdminError) {
      const statusCode = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400;
      return reply.code(statusCode).send({ error: error.code, message: error.message });
    }
    if (error instanceof AttemptError) {
      const statusCode =
        error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'FORBIDDEN' ||
              error.code === 'TEST_NOT_OPEN' ||
              error.code === 'TEST_CLOSED'
            ? 403
            : error.code === 'CONFLICT'
              ? 409
              : error.code === 'EXPIRED'
                ? 410
                : 400;
      return reply.code(statusCode).send({ error: error.code, message: error.message });
    }
    const frameworkCode = (error as { code?: unknown }).code;
    if (
      typeof frameworkCode === 'string' &&
      frameworkCode.startsWith('FST_ERR_') &&
      typeof statusCode === 'number' &&
      statusCode >= 400 &&
      statusCode < 500
    ) {
      return reply
        .code(statusCode)
        .send({ error: frameworkCode, message: (error as Error).message });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  });

  return app;
}
