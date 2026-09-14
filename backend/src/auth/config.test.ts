import { describe, expect, it } from 'vitest';

import { getTokenConfig } from './config.js';

describe('auth configuration', () => {
  it('parses secrets and converts refresh days to milliseconds', () => {
    expect(
      getTokenConfig({
        JWT_ACCESS_SECRET: 'access-secret-that-is-long-enough',
        JWT_REFRESH_SECRET: 'refresh-secret-that-is-long-enough',
        JWT_ACCESS_TTL: '10m',
        JWT_ISSUER: 'test-issuer',
        JWT_REFRESH_TTL_DAYS: '2',
      }),
    ).toEqual({
      accessSecret: 'access-secret-that-is-long-enough',
      refreshSecret: 'refresh-secret-that-is-long-enough',
      accessTtl: '10m',
      issuer: 'test-issuer',
      refreshTtlMs: 172_800_000,
    });
  });

  it('rejects missing or short secrets', () => {
    expect(() => getTokenConfig({ JWT_ACCESS_SECRET: 'short' })).toThrow();
  });
});
