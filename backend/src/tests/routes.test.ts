import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { AuthService } from '../auth/service.js';
import type { TokenService } from '../auth/tokens.js';
import type { Database } from '../db/client.js';
import testsRoutes from './routes.js';
import type { TestsService } from './service.js';

function stubTokens() {
  return {
    verifyAccessToken: vi.fn().mockResolvedValue({ sub: '10', role: 'user' }),
  } as unknown as TokenService;
}

describe('test route validation', () => {
  const app = buildApp({
    auth: {
      service: {} as AuthService,
      tokens: {
        verifyAccessToken: vi.fn(),
      } as unknown as TokenService,
      database: {} as Database,
    },
  });

  beforeAll(async () => app.ready());
  afterAll(async () => app.close());

  it('returns a validation error for malformed test IDs', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/tests/not-a-number' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
  });
});

describe('test list filters', () => {
  const tokens = stubTokens();
  const list = vi.fn().mockResolvedValue([]);
  const app = buildApp({});
  app.register(testsRoutes, {
    db: {} as Database,
    tokens,
    service: { list } as unknown as TestsService,
  });

  beforeAll(async () => app.ready());
  afterAll(async () => app.close());

  it('forwards parsed search and facet filters to the service', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tests?q=c%2B%2B&category=cpp&difficulty=easy',
    });

    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith(undefined, undefined, {
      search: 'c++',
      category: 'cpp',
      difficulty: 'easy',
    });
  });

  it('ignores a blank search query', async () => {
    list.mockClear();
    const response = await app.inject({ method: 'GET', url: '/api/v1/tests?q=%20%20' });

    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith(undefined, undefined, {});
  });

  it('rejects unknown category and difficulty values', async () => {
    for (const url of ['/api/v1/tests?category=cobol', '/api/v1/tests?difficulty=extreme']) {
      const response = await app.inject({ method: 'GET', url });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
    }
  });

  it('rejects overlong search queries', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/tests?q=${'x'.repeat(101)}` });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
  });
});
