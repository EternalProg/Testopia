import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type { RefreshTokensRepository } from '../repositories/refresh-tokens.repository.js';
import { TokenService } from './tokens.js';

const config = {
  accessSecret: 'access-secret-that-is-long-enough',
  refreshSecret: 'refresh-secret-that-is-long-enough',
  accessTtl: '15m',
  issuer: 'testopia-test',
  refreshTtlMs: 60_000,
};

function repositoryMock() {
  return {
    create: vi.fn(),
    findByHash: vi.fn(),
    revoke: vi.fn(),
    rotate: vi.fn(),
  } as unknown as RefreshTokensRepository;
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

describe('TokenService', () => {
  it('creates and verifies an access token with identity and role claims', async () => {
    const service = new TokenService(config, repositoryMock());
    const token = await service.createAccessToken({ id: 5, role: 'admin' });

    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({
      sub: '5',
      role: 'admin',
      type: 'access',
    });
  });

  it('rejects a token signed with another secret', async () => {
    const service = new TokenService(config, repositoryMock());
    const other = new TokenService(
      { ...config, accessSecret: 'different-secret' },
      repositoryMock(),
    );
    const token = await other.createAccessToken({ id: 5, role: 'user' });

    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });

  it('rotates a valid refresh token and revokes its predecessor', async () => {
    const repository = repositoryMock();
    const service = new TokenService(config, repository);
    const created = await service.createRefreshToken(5);
    vi.mocked(repository.findByHash).mockResolvedValue({
      id: created.id,
      userId: 5,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    vi.mocked(repository.rotate).mockResolvedValue(true);

    const replacement = await service.rotateRefreshToken(created.token);

    expect(replacement.userId).toBe(5);
    expect(repository.create).toHaveBeenCalledOnce();
    expect(repository.rotate).toHaveBeenCalledWith(
      hash(created.token),
      created.id,
      expect.objectContaining({ userId: 5 }),
    );
  });

  it.each([{ expiresAt: new Date(Date.now() - 60_000) }])(
    'rejects expired refresh tokens',
    async (stored) => {
      const repository = repositoryMock();
      vi.mocked(repository.findByHash).mockResolvedValue({
        id: 'old',
        userId: 5,
        revokedAt: null,
        ...stored,
      });
      const service = new TokenService(config, repository);

      await expect(service.rotateRefreshToken('refresh-token')).rejects.toThrow(
        'Invalid refresh token',
      );
    },
  );

  it('rejects rotation of an unknown token', async () => {
    const repository = repositoryMock();
    vi.mocked(repository.findByHash).mockResolvedValue(null);
    const service = new TokenService(config, repository);

    await expect(service.rotateRefreshToken('unknown-token')).rejects.toThrow(
      'Invalid refresh token',
    );
    expect(repository.rotate).not.toHaveBeenCalled();
  });

  it('revokes an existing token and ignores an unknown token', async () => {
    const repository = repositoryMock();
    const service = new TokenService(config, repository);
    vi.mocked(repository.findByHash)
      .mockResolvedValueOnce({ revokedAt: null, id: 'id' } as never)
      .mockResolvedValueOnce(null);
    vi.mocked(repository.rotate).mockResolvedValue(false);

    await service.revokeRefreshToken('known');
    await service.revokeRefreshToken('unknown');

    expect(repository.revoke).toHaveBeenCalledWith(hash('known'));
    expect(repository.revoke).toHaveBeenCalledOnce();
  });

  it('accepts only one winner when two requests rotate the same token', async () => {
    const repository = repositoryMock();
    const service = new TokenService(config, repository);
    const created = await service.createRefreshToken(5);
    vi.mocked(repository.findByHash).mockResolvedValue({
      id: created.id,
      userId: 5,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    vi.mocked(repository.rotate).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const results = await Promise.allSettled([
      service.rotateRefreshToken(created.token),
      service.rotateRefreshToken(created.token),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
});
