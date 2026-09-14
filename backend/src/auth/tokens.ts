import { createHash, randomUUID } from 'node:crypto';

import { jwtVerify, SignJWT, type JWTPayload } from 'jose';

import type { UserRole } from '@practice-works/shared';

import type { RefreshTokensRepository } from '../repositories/refresh-tokens.repository.js';
import type { refreshTokens } from '../db/schema.js';

export interface TokenConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtl: string;
  issuer: string;
  refreshTtlMs: number;
}

export interface AccessTokenPayload extends JWTPayload {
  sub: string;
  role: UserRole;
  type: 'access';
}

function secret(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class TokenService {
  constructor(
    private readonly config: TokenConfig,
    private readonly refreshTokens: RefreshTokensRepository,
  ) {}

  async createAccessToken(user: { id: number; role: UserRole }): Promise<string> {
    return new SignJWT({ role: user.role, type: 'access' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(String(user.id))
      .setIssuedAt()
      .setIssuer(this.config.issuer)
      .setExpirationTime(this.config.accessTtl)
      .sign(secret(this.config.accessSecret));
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const { payload } = await jwtVerify(token, secret(this.config.accessSecret), {
      issuer: this.config.issuer,
      algorithms: ['HS256'],
    });

    if (
      typeof payload.sub !== 'string' ||
      payload.type !== 'access' ||
      typeof payload.role !== 'string'
    ) {
      throw new Error('Invalid access token claims');
    }

    return payload as AccessTokenPayload;
  }

  async createRefreshToken(
    userId: number,
    repository = this.refreshTokens,
  ): Promise<{ token: string; id: string; expiresAt: Date }> {
    const refresh = await this.buildRefreshToken(userId);
    await repository.create({
      id: refresh.id,
      userId,
      tokenHash: hashRefreshToken(refresh.token),
      expiresAt: refresh.expiresAt,
    });
    return refresh;
  }

  private async buildRefreshToken(
    userId: number,
  ): Promise<{ token: string; id: string; expiresAt: Date }> {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + this.config.refreshTtlMs);
    const token = await new SignJWT({ type: 'refresh' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(String(userId))
      .setJti(id)
      .setIssuedAt()
      .setIssuer(this.config.issuer)
      .setExpirationTime(expiresAt)
      .sign(secret(this.config.refreshSecret));
    return { token, id, expiresAt };
  }

  async rotateRefreshToken(
    token: string,
  ): Promise<{ userId: number; token: string; expiresAt: Date }> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, secret(this.config.refreshSecret), {
        issuer: this.config.issuer,
        algorithms: ['HS256'],
      }));
    } catch {
      throw new Error('Invalid refresh token');
    }
    const stored = await this.refreshTokens.findByHash(hashRefreshToken(token));
    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt <= new Date() ||
      payload.jti !== stored.id ||
      typeof payload.sub !== 'string' ||
      Number(payload.sub) !== stored.userId ||
      payload.type !== 'refresh'
    ) {
      throw new Error('Invalid refresh token');
    }

    const replacement = await this.buildRefreshToken(stored.userId);
    const rotated = await this.refreshTokens.rotate(stored.id, {
      id: replacement.id,
      userId: stored.userId,
      tokenHash: hashRefreshToken(replacement.token),
      expiresAt: replacement.expiresAt,
    } satisfies typeof refreshTokens.$inferInsert);
    if (!rotated) throw new Error('Invalid refresh token');

    return { userId: stored.userId, token: replacement.token, expiresAt: replacement.expiresAt };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    const stored = await this.refreshTokens.findByHash(hashRefreshToken(token));
    if (stored && !stored.revokedAt) {
      await this.refreshTokens.revoke(stored.id);
    }
  }
}
