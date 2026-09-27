import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { AuthService } from '../auth/service.js';
import type { TokenService } from '../auth/tokens.js';
import type { Database } from '../db/client.js';

function stubTokens() {
  return {
    verifyAccessToken: vi.fn().mockResolvedValue({ sub: '1', role: 'user', type: 'access' }),
  } as unknown as TokenService;
}

interface ExpectedRoute {
  method: string;
  path: string;
  access: 'public' | 'optional' | 'protected';
}

// Every /api/v1/* route registered by the application router.
const expectedRoutes: ExpectedRoute[] = [
  { method: 'POST', path: '/api/v1/auth/register', access: 'public' },
  { method: 'POST', path: '/api/v1/auth/login', access: 'public' },
  { method: 'POST', path: '/api/v1/auth/refresh', access: 'public' },
  { method: 'POST', path: '/api/v1/auth/logout', access: 'public' },
  { method: 'GET', path: '/api/v1/auth/me', access: 'protected' },
  { method: 'GET', path: '/api/v1/auth/current-user', access: 'protected' },
  { method: 'GET', path: '/api/v1/auth/admin/current-user', access: 'protected' },
  { method: 'GET', path: '/api/v1/tests', access: 'optional' },
  { method: 'POST', path: '/api/v1/tests', access: 'protected' },
  { method: 'GET', path: '/api/v1/tests/{id}', access: 'optional' },
  { method: 'PATCH', path: '/api/v1/tests/{id}', access: 'protected' },
  { method: 'DELETE', path: '/api/v1/tests/{id}', access: 'protected' },
  { method: 'POST', path: '/api/v1/tests/{id}/publish', access: 'protected' },
  { method: 'POST', path: '/api/v1/tests/{id}/unpublish', access: 'protected' },
  { method: 'POST', path: '/api/v1/tests/{id}/questions', access: 'protected' },
  { method: 'PATCH', path: '/api/v1/tests/{id}/questions/{questionId}', access: 'protected' },
  { method: 'DELETE', path: '/api/v1/tests/{id}/questions/{questionId}', access: 'protected' },
  { method: 'POST', path: '/api/v1/tests/{id}/attempts', access: 'protected' },
  { method: 'GET', path: '/api/v1/attempts/{id}', access: 'protected' },
  { method: 'GET', path: '/api/v1/attempts/{id}/result', access: 'protected' },
  { method: 'GET', path: '/api/v1/tests/{id}/attempts', access: 'protected' },
  { method: 'POST', path: '/api/v1/attempts/{id}/submit', access: 'protected' },
  { method: 'GET', path: '/api/v1/tests/{id}/statistics', access: 'protected' },
  { method: 'GET', path: '/api/v1/users/me/statistics', access: 'protected' },
  { method: 'GET', path: '/api/v1/admin/users', access: 'protected' },
  { method: 'PATCH', path: '/api/v1/admin/users/{id}/role', access: 'protected' },
];

describe('openapi plugin', () => {
  const app = buildApp({
    auth: { service: {} as AuthService, tokens: stubTokens(), database: {} as Database },
  });

  beforeAll(async () => app.ready());
  afterAll(async () => app.close());

  it('serves a valid OpenAPI 3.0 document listing every /api/v1/* route', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });

    expect(response.statusCode).toBe(200);
    const spec = response.json() as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, Record<string, { description?: string; security?: unknown }>>;
      components: { securitySchemes: { bearerAuth: { type: string; scheme: string } } };
    };

    expect(spec.openapi).toMatch(/^3\.0\./);
    expect(spec.info.title).toBe('Educational Test Platform API');
    expect(spec.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });

    for (const route of expectedRoutes) {
      const operation = spec.paths[route.path]?.[route.method.toLowerCase()];
      expect(operation, `${route.method} ${route.path} documented`).toBeDefined();
      expect(operation?.description, `${route.method} ${route.path} summarized`).toBeTruthy();
      // Every operation gets at least the default response entry, keeping
      // the document valid OpenAPI 3.0 without runtime response schemas.
      expect(
        (operation as unknown as { responses?: unknown }).responses,
        `${route.method} ${route.path} has responses`,
      ).toBeDefined();
    }
  });

  it('marks protected routes with bearer auth and leaves public routes open', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    const spec = response.json() as {
      paths: Record<string, Record<string, { security?: Array<Record<string, unknown>> }>>;
    };

    for (const route of expectedRoutes) {
      const security = spec.paths[route.path]?.[route.method.toLowerCase()]?.security;
      if (route.access === 'protected') {
        expect(security, `${route.method} ${route.path} bearer-marked`).toContainEqual({
          bearerAuth: [],
        });
      } else if (route.access === 'public') {
        expect(security, `${route.method} ${route.path} public`).toBeUndefined();
      } else {
        // Optional auth: bearer accepted, anonymous allowed.
        expect(security, `${route.method} ${route.path} optional-auth`).toContainEqual({
          bearerAuth: [],
        });
      }
    }
  });

  it('derives request components from the shared Zod schemas', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    const spec = response.json() as {
      components: {
        schemas: Record<string, { type?: string; properties?: Record<string, unknown> }>;
      };
    };

    expect(spec.components.schemas.RegisterRequest).toMatchObject({ type: 'object' });
    expect(spec.components.schemas.RegisterRequest?.properties).toMatchObject({
      email: expect.anything(),
      username: expect.anything(),
      password: expect.anything(),
    });
    expect(spec.components.schemas.SubmitAttemptRequest).toMatchObject({ type: 'object' });
    expect(spec.components.schemas.MyStatisticsResponse).toMatchObject({ type: 'object' });
    expect(spec.components.schemas.MyStatisticsResponse?.properties).toMatchObject({
      testsTaken: expect.anything(),
      totalAttempts: expect.anything(),
      tests: expect.anything(),
    });
  });

  it('serves the Swagger UI', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/docs' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });
});
