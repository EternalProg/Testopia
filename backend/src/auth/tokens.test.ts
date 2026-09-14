import { describe, expect, it, vi } from 'vitest';

import type { RefreshTokensRepository } from '../repositories/refresh-tokens.repository.js';
import { TokenService } from './tokens.js';

const config = {
  accessSecret: 'access-secret-that-is-long-enough',
  accessTtl: '15m',
  issuer: 'practiceworks-test',
  refreshTtlMs: 60_000,
};

function repositoryMock() {
  return {
    create: vi.fn(),
    findByHash: vi.fn(),
    revoke: vi.fn(),
  } as unknown as RefreshTokensRepository;
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
      tokenHash: 'hash',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      replacedByTokenId: null,
      createdAt: new Date(),
    });

    const replacement = await service.rotateRefreshToken(created.token);

    expect(replacement.userId).toBe(5);
    expect(repository.create).toHaveBeenCalledTimes(2);
    expect(repository.revoke).toHaveBeenCalledWith(created.id, expect.any(String));
  });

  it.each([
    { revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) },
    { revokedAt: null, expiresAt: new Date(Date.now() - 60_000) },
  ])('rejects revoked or expired refresh tokens', async (stored) => {
    const repository = repositoryMock();
    vi.mocked(repository.findByHash).mockResolvedValue({
      id: 'old',
      userId: 5,
      tokenHash: 'hash',
      ...stored,
      replacedByTokenId: null,
      createdAt: new Date(),
    });
    const service = new TokenService(config, repository);

    await expect(service.rotateRefreshToken('refresh-token')).rejects.toThrow(
      'Invalid refresh token',
    );
  });

  it('revokes an existing token and ignores an unknown token', async () => {
    const repository = repositoryMock();
    const service = new TokenService(config, repository);
    vi.mocked(repository.findByHash)
      .mockResolvedValueOnce({ revokedAt: null, id: 'id' } as never)
      .mockResolvedValueOnce(null);

    await service.revokeRefreshToken('known');
    await service.revokeRefreshToken('unknown');

    expect(repository.revoke).toHaveBeenCalledWith('id');
  });
});
