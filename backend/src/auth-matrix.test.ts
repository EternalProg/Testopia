import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from './app.js';
import type { AuthService } from './auth/service.js';
import type { TokenService } from './auth/tokens.js';
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
    async list() {
      return [];
    }
  },
}));

// Authorization matrix (route x required access). Cases already covered
// elsewhere are excluded with pointers instead of being re-asserted:
// - GET /tests/:id/statistics 401 in statistics/routes.test.ts
// - all five attempt endpoints 401 in attempts/routes.test.ts
// - GET /auth/me 401 and admin-route 403-for-taker in auth/routes.test.ts
// - attempt owner/admin 403s in attempts/routes.test.ts
describe('authorization matrix', () => {
  const tokens = {
    verifyAccessToken: vi.fn(async () => ({ sub: '7', role: 'user', type: 'access' })),
  } as unknown as TokenService;
  const app = buildApp({
    auth: { service: {} as AuthService, tokens, database: {} as Database },
  });
  const takerHeaders = { authorization: 'Bearer taker-token' };

  beforeAll(async () => app.ready());
  afterAll(async () => app.close());

  describe('unauthenticated requests to protected routes return 401', () => {
    const cases: Array<{ method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; url: string }> = [
      { method: 'GET', url: '/api/v1/auth/current-user' },
      { method: 'GET', url: '/api/v1/auth/admin/current-user' },
      { method: 'GET', url: '/api/v1/tests?scope=mine' },
      { method: 'GET', url: '/api/v1/tests?scope=all' },
      { method: 'POST', url: '/api/v1/tests' },
      { method: 'PATCH', url: '/api/v1/tests/1' },
      { method: 'DELETE', url: '/api/v1/tests/1' },
      { method: 'POST', url: '/api/v1/tests/1/publish' },
      { method: 'POST', url: '/api/v1/tests/1/unpublish' },
      { method: 'POST', url: '/api/v1/tests/1/questions' },
      { method: 'PATCH', url: '/api/v1/tests/1/questions/2' },
      { method: 'DELETE', url: '/api/v1/tests/1/questions/2' },
    ];

    for (const { method, url } of cases) {
      it(`${method} ${url}`, async () => {
        const response = await app.inject(
          method === 'GET' ? { method, url } : { method, url, payload: {} },
        );

        expect(response.statusCode).toBe(401);
        expect(response.json()).toMatchObject({ error: 'UNAUTHORIZED' });
      });
    }
  });

  describe('manager-only routes return 403 for takers', () => {
    it('rejects scope=all for non-admins', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tests?scope=all',
        headers: takerHeaders,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: 'FORBIDDEN' });
    });

    it('rejects test mutation by non-authors', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/tests/1',
        headers: takerHeaders,
        payload: { title: 'Hijacked' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: 'FORBIDDEN' });
    });

    it('rejects question deletion by non-authors', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/tests/1/questions/2',
        headers: takerHeaders,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: 'FORBIDDEN' });
    });

    it('rejects publish by non-authors', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/tests/1/publish',
        headers: takerHeaders,
        payload: {},
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: 'FORBIDDEN' });
    });

    it('rejects question creation by non-authors', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/tests/1/questions',
        headers: takerHeaders,
        payload: {
          text: 'Hijacked?',
          type: 'single_choice',
          orderIndex: 0,
          options: [
            { text: 'A', isCorrect: true },
            { text: 'B', isCorrect: false },
          ],
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: 'FORBIDDEN' });
    });

    it('rejects statistics reads by takers through the real service rule', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tests/1/statistics',
        headers: takerHeaders,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: 'FORBIDDEN' });
    });
  });
});
