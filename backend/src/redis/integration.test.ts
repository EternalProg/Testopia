import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRedis, type RedisClient } from './client.js';
import { getRedisUrl } from './config.js';

const enabled = process.env.RUN_REDIS_INTEGRATION === '1';

describe('redis integration', () => {
  if (!enabled) {
    it.skip('requires RUN_REDIS_INTEGRATION=1', () => undefined);
    return;
  }

  let redis: RedisClient;
  const keyPrefix = `testopia:test:${process.pid}:`;

  beforeAll(async () => {
    redis = createRedis(getRedisUrl());
    expect(await redis.ping()).toBe('PONG');
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('round-trips a value with a TTL', async () => {
    const key = `${keyPrefix}session`;
    await redis.set(key, 'value', 'PX', 60_000);

    expect(await redis.get(key)).toBe('value');
    const ttl = await redis.pttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);

    expect(await redis.del(key)).toBe(1);
    expect(await redis.get(key)).toBeNull();
  });

  it('expires keys without a sweeper', async () => {
    const key = `${keyPrefix}ephemeral`;
    await redis.set(key, 'value', 'PX', 50);
    expect(await redis.get(key)).toBe('value');

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await redis.get(key)).toBeNull();
  });
});
