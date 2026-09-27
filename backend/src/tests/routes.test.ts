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
    expect(list).toHaveBeenCalledWith(
      undefined,
      undefined,
      {
        search: 'c++',
        category: 'cpp',
        difficulty: 'easy',
      },
      {},
    );
  });

  it('ignores a blank search query', async () => {
    list.mockClear();
    const response = await app.inject({ method: 'GET', url: '/api/v1/tests?q=%20%20' });

    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith(undefined, undefined, {}, {});
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

  it('passes sort without page through as a sorted legacy array', async () => {
    list.mockClear();
    const response = await app.inject({ method: 'GET', url: '/api/v1/tests?sort=popular' });

    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith(undefined, undefined, {}, { sort: 'popular' });
  });

  it('opts into pagination only when page is present', async () => {
    list.mockClear();
    const paged = await app.inject({
      method: 'GET',
      url: '/api/v1/tests?page=2&pageSize=5&sort=hardest',
    });

    expect(paged.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith(
      undefined,
      undefined,
      {},
      { sort: 'hardest', page: 2, pageSize: 5 },
    );

    list.mockClear();
    const defaulted = await app.inject({ method: 'GET', url: '/api/v1/tests?page=1' });

    expect(defaulted.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith(undefined, undefined, {}, { page: 1, pageSize: 20 });

    // pageSize alone does not opt into the envelope.
    list.mockClear();
    const legacy = await app.inject({ method: 'GET', url: '/api/v1/tests?pageSize=5' });

    expect(legacy.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith(undefined, undefined, {}, {});
  });

  it('rejects invalid sort and pagination values', async () => {
    for (const url of [
      '/api/v1/tests?sort=random',
      '/api/v1/tests?page=0',
      '/api/v1/tests?page=abc',
      '/api/v1/tests?page=1&pageSize=101',
      '/api/v1/tests?page=1&pageSize=0',
    ]) {
      const response = await app.inject({ method: 'GET', url });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
    }
  });
});
