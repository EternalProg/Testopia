import { createHash } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRedis, type RedisClient } from '../redis/client.js';
import { getRedisUrl } from '../redis/config.js';
import {
  refreshTokenKey,
  RefreshTokensRepository,
  type RefreshTokenInsert,
} from './refresh-tokens.repository.js';

const enabled = process.env.RUN_REDIS_INTEGRATION === '1';

function insert(overrides: Partial<RefreshTokenInsert> = {}): RefreshTokenInsert {
  const tokenHash = createHash('sha256').update(`token-${Math.random()}`).digest('hex');
  return {
    id: `id-${Math.random()}`,
    userId: 7,
    tokenHash,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

describe('refresh tokens Redis integration', () => {
  if (!enabled) {
    it.skip('requires RUN_REDIS_INTEGRATION=1', () => undefined);
    return;
  }

  let redis: RedisClient;
  let repository: RefreshTokensRepository;
  const hashes: string[] = [];

  beforeAll(async () => {
    redis = createRedis(getRedisUrl());
    repository = new RefreshTokensRepository(redis);
    // The shared client is lazy with the offline queue off: connect
    // explicitly, otherwise the first command fails instantly (see
    // plugins/redis, which does the same at startup).
    await redis.connect();
    expect(await redis.ping()).toBe('PONG');
  });

  afterAll(async () => {
    // Targeted cleanup only: never flush a database that may hold sessions
    // from other runs or a local dev server.
    for (const tokenHash of hashes) {
      await redis.del(refreshTokenKey(tokenHash));
    }
    await redis.quit();
  });

  it('creates, reads, and revokes a session with a Redis TTL', async () => {
    const input = insert();
    hashes.push(input.tokenHash);

    await repository.create(input);
    const stored = await repository.findByHash(input.tokenHash);
    expect(stored).toMatchObject({ id: input.id, userId: input.userId, revokedAt: null });

    const ttl = await redis.pttl(refreshTokenKey(input.tokenHash));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);

    await repository.revoke(input.tokenHash);
    await expect(repository.findByHash(input.tokenHash)).resolves.toBeNull();
  });

  it('lets exactly one concurrent rotation win', async () => {
    const input = insert();
    const replacement = insert({ userId: input.userId });
    hashes.push(input.tokenHash, replacement.tokenHash);

    await repository.create(input);
    const results = await Promise.all([
      repository.rotate(input.tokenHash, input.id, replacement),
      repository.rotate(input.tokenHash, input.id, { ...replacement, id: 'second-id' }),
    ]);

    expect(results.sort()).toEqual([false, true]);
    // The loser finds no key: the old session is gone either way.
    await expect(repository.findByHash(input.tokenHash)).resolves.toBeNull();
  });

  it('rejects rotation when the expected id does not match', async () => {
    const input = insert();
    hashes.push(input.tokenHash);

    await repository.create(input);
    await expect(
      repository.rotate(input.tokenHash, 'another-id', insert({ userId: input.userId })),
    ).resolves.toBe(false);
    // A failed rotation leaves the live session untouched.
    await expect(repository.findByHash(input.tokenHash)).resolves.not.toBeNull();
  });

  it('expires sessions without a sweeper', async () => {
    const input = insert({ expiresAt: new Date(Date.now() + 50) });
    hashes.push(input.tokenHash);

    await repository.create(input);
    await expect(repository.findByHash(input.tokenHash)).resolves.not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 150));
    await expect(repository.findByHash(input.tokenHash)).resolves.toBeNull();
  });
});
