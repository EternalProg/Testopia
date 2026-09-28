import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RedisClient } from '../redis/client.js';
import { refreshTokenKey, RefreshTokensRepository } from './refresh-tokens.repository.js';

function redisMock() {
  const exec = vi.fn().mockResolvedValue([['OK'], ['OK']]);
  const hset = vi.fn().mockReturnThis();
  const pexpireat = vi.fn().mockReturnThis();
  const multi = vi.fn(() => ({ hset, pexpireat, exec }));
  return {
    multi,
    hset,
    pexpireat,
    exec,
    hgetall: vi.fn().mockResolvedValue({}),
    del: vi.fn().mockResolvedValue(1),
    eval: vi.fn().mockResolvedValue(1),
  };
}

type RedisMock = ReturnType<typeof redisMock>;

describe('RefreshTokensRepository', () => {
  let redis: RedisMock;

  beforeEach(() => {
    redis = redisMock();
  });

  it('stores a session hash with an absolute expiry in one round trip', async () => {
    const repository = new RefreshTokensRepository(redis as unknown as RedisClient);
    const expiresAt = new Date(Date.now() + 60_000);

    await repository.create({ id: 'token-id', userId: 7, tokenHash: 'hash', expiresAt });

    expect(redis.multi).toHaveBeenCalledOnce();
    expect(redis.hset).toHaveBeenCalledWith(refreshTokenKey('hash'), {
      id: 'token-id',
      userId: '7',
      expiresAt: String(expiresAt.getTime()),
    });
    expect(redis.pexpireat).toHaveBeenCalledWith(refreshTokenKey('hash'), expiresAt.getTime());
    expect(redis.exec).toHaveBeenCalledOnce();
  });

  it('reads a stored session and rejects missing or malformed hashes', async () => {
    const repository = new RefreshTokensRepository(redis as unknown as RedisClient);
    const expiresAt = new Date(Date.now() + 60_000);

    redis.hgetall.mockResolvedValueOnce({
      id: 'token-id',
      userId: '7',
      expiresAt: String(expiresAt.getTime()),
    });
    await expect(repository.findByHash('hash')).resolves.toEqual({
      id: 'token-id',
      userId: 7,
      expiresAt,
      revokedAt: null,
    });

    // Absent key, blank id, non-numeric user, and non-numeric expiry all read
    // as invalid rather than as a session.
    redis.hgetall.mockResolvedValueOnce({});
    await expect(repository.findByHash('unknown')).resolves.toBeNull();
    redis.hgetall.mockResolvedValueOnce({ id: '', userId: '7', expiresAt: '1' });
    await expect(repository.findByHash('blank')).resolves.toBeNull();
    redis.hgetall.mockResolvedValueOnce({ id: 'x', userId: 'seven', expiresAt: '1' });
    await expect(repository.findByHash('bad-user')).resolves.toBeNull();
    redis.hgetall.mockResolvedValueOnce({ id: 'x', userId: '7', expiresAt: 'never' });
    await expect(repository.findByHash('bad-expiry')).resolves.toBeNull();
  });

  it('deletes the session key on revoke', async () => {
    const repository = new RefreshTokensRepository(redis as unknown as RedisClient);

    await repository.revoke('hash');

    expect(redis.del).toHaveBeenCalledWith(refreshTokenKey('hash'));
  });

  it('rotates through Lua and maps the script verdict to boolean', async () => {
    const repository = new RefreshTokensRepository(redis as unknown as RedisClient);
    const replacement = {
      id: 'new-id',
      userId: 7,
      tokenHash: 'new-hash',
      expiresAt: new Date(Date.now() + 60_000),
    };

    await expect(repository.rotate('old-hash', 'old-id', replacement)).resolves.toBe(true);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      refreshTokenKey('old-hash'),
      refreshTokenKey('new-hash'),
      'old-id',
      'new-id',
      '7',
      String(replacement.expiresAt.getTime()),
      replacement.expiresAt.getTime(),
    );

    redis.eval.mockResolvedValueOnce(0);
    await expect(repository.rotate('old-hash', 'old-id', replacement)).resolves.toBe(false);
  });
});
