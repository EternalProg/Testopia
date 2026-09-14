import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/client.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';

describe('RefreshTokensRepository', () => {
  it('creates, finds, and revokes a refresh token', async () => {
    const token = {
      id: 'token-id',
      userId: 1,
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      replacedByTokenId: null,
      createdAt: new Date(),
    };
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    const limit = vi.fn().mockResolvedValue([token]);
    const where = vi.fn().mockReturnValue({ limit });
    const select = vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where }) });
    const set = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const update = vi.fn().mockReturnValue({ set });
    const repository = new RefreshTokensRepository({
      insert,
      select,
      update,
    } as unknown as Database);

    await repository.create(token);
    await expect(repository.findByHash(token.tokenHash)).resolves.toEqual(token);
    await repository.revoke(token.id, 'replacement-id');

    expect(values).toHaveBeenCalledWith(token);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ replacedByTokenId: 'replacement-id' }),
    );
  });

  it('returns null for an unknown refresh token hash', async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const select = vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where }) });
    const repository = new RefreshTokensRepository({ select } as unknown as Database);

    await expect(repository.findByHash('unknown')).resolves.toBeNull();
  });

  it('allows only one concurrent rotation and inserts the replacement atomically', async () => {
    const updateResult = [{ affectedRows: 1 }];
    const update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(updateResult) }),
    });
    const values = vi.fn().mockResolvedValue(undefined);
    const transaction = { update, insert: vi.fn().mockReturnValue({ values }) };
    const db = {
      transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<boolean>) =>
        callback(transaction),
      ),
    };
    const repository = new RefreshTokensRepository(db as unknown as Database);
    const replacement = { id: 'new-id', userId: 1, tokenHash: 'new-hash', expiresAt: new Date() };

    await expect(repository.rotate('old-id', replacement)).resolves.toBe(true);
    expect(update).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(replacement);

    update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ affectedRows: 0 }]) }),
    });
    await expect(repository.rotate('old-id', { ...replacement, id: 'second-id' })).resolves.toBe(
      false,
    );
    expect(values).toHaveBeenCalledOnce();
  });
});
