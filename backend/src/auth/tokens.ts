import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { jwtVerify, SignJWT, type JWTPayload } from 'jose';

import type { UserRole } from '@practice-works/shared';

import type { RefreshTokensRepository } from '../repositories/refresh-tokens.repository.js';

export interface TokenConfig {
  accessSecret: string;
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
  ): Promise<{ token: string; id: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + this.config.refreshTtlMs);

    await this.refreshTokens.create({
      id,
      userId,
      tokenHash: hashRefreshToken(token),
      expiresAt,
    });

    return { token, id, expiresAt };
  }

  async rotateRefreshToken(
    token: string,
  ): Promise<{ userId: number; token: string; expiresAt: Date }> {
    const stored = await this.refreshTokens.findByHash(hashRefreshToken(token));
    if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) {
      throw new Error('Invalid refresh token');
    }

    const replacement = await this.createRefreshToken(stored.userId);
    await this.refreshTokens.revoke(stored.id, replacement.id);

    return { userId: stored.userId, token: replacement.token, expiresAt: replacement.expiresAt };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    const stored = await this.refreshTokens.findByHash(hashRefreshToken(token));
    if (stored && !stored.revokedAt) {
      await this.refreshTokens.revoke(stored.id);
    }
  }
}
