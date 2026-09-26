import {
  createQuestionSchema,
  createTestSchema,
  healthResponseSchema,
  loginSchema,
  registerSchema,
  submitAttemptSchema,
} from '@testopia/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from './app.js';
import { AuthError } from './auth/errors.js';
import type { AuthService } from './auth/service.js';
import type { TokenService } from './auth/tokens.js';
import { createAttemptsController } from './attempts/controllers.js';
import { AttemptError } from './attempts/errors.js';
import type { AttemptsService } from './attempts/service.js';
import type { Database } from './db/client.js';

vi.mock('./repositories/tests.repository.js', () => ({
  TestsRepository: class {
    async findById(id: number) {
      if (id === 1) return { id: 1, authorId: 10, isPublished: false };
      if (id === 2) return { id: 2, authorId: 10, isPublished: true };
      return null;
    }
    async findQuestions() {
      return [];
    }
    async countAttempts() {
      return 1;
    }
    async delete() {
      return undefined;
    }
    async list() {
      return [];
    }
  },
}));

function stubTokens() {
  return {
    verifyAccessToken: vi.fn(async () => ({ sub: '7', role: 'user', type: 'access' })),
  } as unknown as TokenService;
}

function conflictingAuthService() {
  return {
    register: vi.fn(async () => {
      throw new AuthError('Email is already registered', 'EMAIL_TAKEN');
    }),
  } as unknown as AuthService;
}

// Backend side of the API contract: every domain exposes its routes over
// HTTP, protected routes sit behind authentication, and failures map to the
// documented error shapes. Live 429/413 flood behavior stays covered by
// plugins/security.test.ts; here we pin representative shapes only.
describe('API contract', () => {
  const app = buildApp({
    auth: { service: conflictingAuthService(), tokens: stubTokens(), database: {} as Database },
  });
  const takerHeaders = { authorization: 'Bearer taker-token' };

  beforeAll(async () => app.ready());
  afterAll(async () => app.close());

  it('exposes every domain over OpenAPI JSON and serves Swagger UI', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });

    expect(response.statusCode).toBe(200);
    const spec = response.json() as {
      openapi: string;
      paths: Record<string, Record<string, { description?: string }>>;
    };
    expect(spec.openapi).toMatch(/^3\.0\./);
    for (const path of [
      '/api/v1/auth/register',
      '/api/v1/auth/login',
      '/api/v1/tests',
      '/api/v1/tests/{id}',
      '/api/v1/tests/{id}/questions',
      '/api/v1/tests/{id}/attempts',
      '/api/v1/attempts/{id}/submit',
      '/api/v1/tests/{id}/statistics',
      '/api/v1/users/me/statistics',
    ]) {
      expect(spec.paths[path], `${path} documented`).toBeDefined();
    }

    const docs = await app.inject({ method: 'GET', url: '/api/v1/docs' });
    expect(docs.statusCode).toBe(200);
    expect(docs.headers['content-type']).toContain('text/html');
  });

  it('returns 401 for unauthenticated calls to protected attempt and statistics routes', async () => {
    for (const request of [
      { method: 'POST', url: '/api/v1/tests/2/attempts', payload: {} },
      { method: 'GET', url: '/api/v1/attempts/1' },
      { method: 'GET', url: '/api/v1/attempts/1/result' },
      { method: 'GET', url: '/api/v1/tests/2/attempts' },
      { method: 'POST', url: '/api/v1/attempts/1/submit', payload: { answers: [] } },
      { method: 'GET', url: '/api/v1/tests/2/statistics' },
      { method: 'GET', url: '/api/v1/users/me/statistics' },
    ] as const) {
      const response = await app.inject(request);
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: 'UNAUTHORIZED' });
    }
  });

  it('maps validation, forbidden, missing, and conflict failures to error shapes', async () => {
    const invalidCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/tests',
      headers: takerHeaders,
      payload: { title: '' },
    });
    expect(invalidCreate.statusCode).toBe(400);
    expect(invalidCreate.json()).toMatchObject({ error: 'VALIDATION_ERROR' });

    const forbidden = await app.inject({
      method: 'PATCH',
      url: '/api/v1/tests/1',
      headers: takerHeaders,
      payload: { title: 'Hijacked' },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toMatchObject({ error: 'FORBIDDEN' });

    const missing = await app.inject({ method: 'GET', url: '/api/v1/tests/999999999' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: 'NOT_FOUND' });

    const conflict = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'taken@example.com', username: 'taken', password: 'password123' },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ error: 'EMAIL_TAKEN' });
  });

  it('carries expired submit results on the 410 response', async () => {
    const expiredResult = {
      attempt: { id: 1, status: 'expired', score: 1 },
      answers: [{ questionId: 2, selectedOptionIds: [3], textAnswer: null, isCorrect: true }],
      answersRevealed: true,
    };
    const service = {
      submit: vi.fn(async () => {
        throw new AttemptError('Time limit exceeded', 'EXPIRED', expiredResult);
      }),
    } as unknown as AttemptsService;
    const controller = createAttemptsController(service);
    let status = 0;
    let body: unknown;
    const reply = {
      code: (code: number) => {
        status = code;
        return reply;
      },
      send: (payload: unknown) => {
        body = payload;
        return payload;
      },
    };
    await controller.submitAttempt(
      {
        params: { id: '1' },
        body: { answers: [] },
        authUser: { id: 7, role: 'user' },
      } as never,
      reply as never,
    );

    expect(status).toBe(410);
    expect(body).toMatchObject({ error: 'EXPIRED', ...expiredResult });
  });

  it('refuses to delete a test with attempts over HTTP', async () => {
    const authorApp = buildApp({
      auth: {
        service: {} as AuthService,
        tokens: {
          verifyAccessToken: vi.fn(async () => ({ sub: '10', role: 'user', type: 'access' })),
        } as unknown as TokenService,
        database: {} as Database,
      },
    });
    await authorApp.ready();
    try {
      const response = await authorApp.inject({
        method: 'DELETE',
        url: '/api/v1/tests/1',
        headers: { authorization: 'Bearer author-token' },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        error: 'CONFLICT',
        message: 'Cannot delete a test with attempts',
      });
    } finally {
      await authorApp.close();
    }
  });

  it('rejects oversized JSON bodies with 413', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'user@example.com', password: 'x'.repeat(2 * 1024 * 1024) },
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
  });

  it('rejects empty JSON bodies with 400 instead of 500', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'FST_ERR_CTP_EMPTY_JSON_BODY' });
  });

  it('rate-limits floods with a RATE_LIMITED 429', async () => {
    const previous = process.env.RATE_LIMIT_MAX;
    process.env.RATE_LIMIT_MAX = '3';
    const limited = buildApp();
    await limited.ready();
    try {
      for (let index = 0; index < 3; index += 1) {
        expect((await limited.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
      }
      const throttled = await limited.inject({ method: 'GET', url: '/health' });
      expect(throttled.statusCode).toBe(429);
      expect(throttled.json()).toMatchObject({ error: 'RATE_LIMITED' });
    } finally {
      await limited.close();
      if (previous === undefined) delete process.env.RATE_LIMIT_MAX;
      else process.env.RATE_LIMIT_MAX = previous;
    }
  });

  it('validates representative request/response samples against shared Zod', async () => {
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(healthResponseSchema.safeParse(health.json()).success).toBe(true);

    expect(
      registerSchema.safeParse({
        email: 'contract@example.com',
        username: 'contract-user',
        password: 'password123',
      }).success,
    ).toBe(true);
    expect(
      loginSchema.safeParse({ email: 'contract@example.com', password: 'password123' }).success,
    ).toBe(true);
    expect(
      createTestSchema.safeParse({
        title: 'Contract test',
        isPublished: false,
        shuffleQuestions: false,
        showAnswersAfterCompletion: true,
      }).success,
    ).toBe(true);
    expect(
      createQuestionSchema.safeParse({
        text: 'Contract question?',
        type: 'single_choice',
        orderIndex: 0,
        options: [
          { text: 'Yes', isCorrect: true },
          { text: 'No', isCorrect: false },
        ],
      }).success,
    ).toBe(true);
    expect(
      submitAttemptSchema.safeParse({
        answers: [{ questionId: 1, selectedOptionIds: [2], textAnswer: null }],
      }).success,
    ).toBe(true);
  });
});
