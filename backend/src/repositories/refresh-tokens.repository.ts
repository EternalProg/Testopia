import type { RedisClient } from '../redis/client.js';

/** A live (non-revoked, non-expired) refresh session. Absent key means invalid. */
export interface RefreshTokenRecord {
  id: string;
  userId: number;
  expiresAt: Date;
  revokedAt: null;
}

export interface RefreshTokenInsert {
  id: string;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
}

const keyPrefix = 'testopia:refresh:';

export function refreshTokenKey(tokenHash: string): string {
  return `${keyPrefix}${tokenHash}`;
}

// Rotation must be a single atomic step: verify the old record still carries
// the expected id (single-use guard), drop it, and store the replacement with
// an absolute expiry. A concurrent rotation of the same token finds no key
// and loses, exactly like the old conditional-update row guard did.
const rotateScript = `
if redis.call('HGET', KEYS[1], 'id') ~= ARGV[1] then
  return 0
end
redis.call('DEL', KEYS[1])
redis.call('HSET', KEYS[2], 'id', ARGV[2], 'userId', ARGV[3], 'expiresAt', ARGV[4])
redis.call('PEXPIREAT', KEYS[2], ARGV[5])
return 1
`;

export class RefreshTokensRepository {
  constructor(private readonly redis: RedisClient) {}

  async create(input: RefreshTokenInsert): Promise<void> {
    const key = refreshTokenKey(input.tokenHash);
    // MULTI, not two round trips: a crash between HSET and PEXPIREAT would
    // otherwise leave a session key that never expires.
    const result = await this.redis
      .multi()
      .hset(key, {
        id: input.id,
        userId: String(input.userId),
        expiresAt: String(input.expiresAt.getTime()),
      })
      .pexpireat(key, input.expiresAt.getTime())
      .exec();
    if (!result) {
      throw new Error('Failed to store the refresh token');
    }
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const fields = await this.redis.hgetall(refreshTokenKey(tokenHash));
    const id = fields['id'];
    const userId = Number(fields['userId']);
    const expiresAt = Number(fields['expiresAt']);
    // Expired keys vanish on their own via PEXPIREAT; anything malformed is
    // untrusted input and reads as absent, never as a session.
    if (typeof id !== 'string' || id === '' || !Number.isSafeInteger(userId)) {
      return null;
    }
    if (!Number.isFinite(expiresAt)) {
      return null;
    }
    return { id, userId, expiresAt: new Date(expiresAt), revokedAt: null };
  }

  /** Logout: deleting a missing key is a no-op, matching revoke-if-present. */
  async revoke(tokenHash: string): Promise<void> {
    await this.redis.del(refreshTokenKey(tokenHash));
  }

  async rotate(
    oldHash: string,
    expectedId: string,
    replacement: RefreshTokenInsert,
  ): Promise<boolean> {
    const rotated = (await this.redis.eval(
      rotateScript,
      2,
      refreshTokenKey(oldHash),
      refreshTokenKey(replacement.tokenHash),
      expectedId,
      replacement.id,
      String(replacement.userId),
      String(replacement.expiresAt.getTime()),
      replacement.expiresAt.getTime(),
    )) as number;
    return rotated === 1;
  }
}
