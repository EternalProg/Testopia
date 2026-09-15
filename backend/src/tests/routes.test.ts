import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { AuthService } from '../auth/service.js';
import type { TokenService } from '../auth/tokens.js';
import type { Database } from '../db/client.js';

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
