import { describe, expect, it } from 'vitest';

import { assertTestDatabaseUrl, getDatabaseUrl } from './config.js';

describe('database configuration', () => {
  it('reads a valid MySQL URL', () => {
    expect(getDatabaseUrl({ DATABASE_URL: 'mysql://user:pass@localhost:3306/app' })).toBe(
      'mysql://user:pass@localhost:3306/app',
    );
  });

  it('rejects a missing or non-MySQL URL', () => {
    expect(() => getDatabaseUrl({})).toThrow();
    expect(() => getDatabaseUrl({ DATABASE_URL: 'postgres://localhost/app' })).toThrow();
  });

  it('allows only test databases for integration tests', () => {
    expect(() =>
      assertTestDatabaseUrl('mysql://user:pass@localhost:3306/test_practiceworks'),
    ).not.toThrow();
    expect(() => assertTestDatabaseUrl('mysql://user:pass@localhost:3306/practiceworks')).toThrow(
      'test_',
    );
  });
});
