import { describe, expect, it } from 'vitest';

import { getRedisUrl } from './config.js';

describe('redis configuration', () => {
  it('reads a valid Redis URL', () => {
    expect(getRedisUrl({ REDIS_URL: 'redis://localhost:6379' })).toBe('redis://localhost:6379');
    expect(getRedisUrl({ REDIS_URL: 'redis://cache:6379/2' })).toBe('redis://cache:6379/2');
  });

  it('rejects a missing or non-Redis URL', () => {
    expect(() => getRedisUrl({})).toThrow();
    expect(() => getRedisUrl({ REDIS_URL: 'mysql://localhost/app' })).toThrow();
  });
});
