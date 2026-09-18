import type { LoginInput, RegisterInput, User } from '@testopia/shared';

import type { Database } from '../db/client.js';
import { isDuplicateEntryError } from '../db/errors.js';
import { withTransaction } from '../db/transaction.js';
import { RefreshTokensRepository } from '../repositories/refresh-tokens.repository.js';
import { AuthError } from './errors.js';
import { hashPassword, verifyPassword } from './password.js';
import type { TokenService } from './tokens.js';
import { UsersRepository } from '../repositories/users.repository.js';

function publicUser(user: {
  id: number;
  email: string;
  username: string;
  role: User['role'];
  createdAt: Date;
}): User {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly tokens: TokenService,
    private readonly db?: Database,
  ) {}

  async register(input: RegisterInput) {
    const email = input.email.trim().toLowerCase();
    if (await this.users.findByEmail(email)) {
      throw new AuthError('An account with this email already exists', 'EMAIL_TAKEN');
    }

    const passwordHash = await hashPassword(input.password);

    try {
      if (!this.db) {
        const user = await this.users.create({
          email,
          username: input.username.trim(),
          passwordHash,
        });
        return this.issueSession(user);
      }

      const session = await withTransaction(this.db, async (transaction) => {
        const transactionDb = transaction as unknown as Database;
        const user = await new UsersRepository(transactionDb).create({
          email,
          username: input.username.trim(),
          passwordHash,
        });
        const refresh = await this.tokens.createRefreshToken(
          user.id,
          new RefreshTokensRepository(transactionDb),
        );
        return { user, refresh };
      });

      return this.sessionFromRefresh(session.user, session.refresh);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AuthError('An account with this email already exists', 'EMAIL_TAKEN');
      }
      throw error;
    }
  }

  async login(input: LoginInput) {
    const user = await this.users.findByEmail(input.email.trim().toLowerCase());
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    return this.issueSession(user);
  }

  async refresh(refreshToken: string) {
    try {
      const rotated = await this.tokens.rotateRefreshToken(refreshToken);
      const user = await this.users.findById(rotated.userId);
      if (!user) {
        throw new AuthError('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
      }

      return {
        user: publicUser(user),
        accessToken: await this.tokens.createAccessToken(user),
        refreshToken: rotated.token,
        refreshTokenExpiresAt: rotated.expiresAt,
      };
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    }
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revokeRefreshToken(refreshToken);
  }

  async currentUser(id: number): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) throw new AuthError('Authentication required', 'UNAUTHORIZED');
    return publicUser(user);
  }

  private async issueSession(user: Parameters<typeof publicUser>[0]) {
    const refresh = await this.tokens.createRefreshToken(user.id);
    return this.sessionFromRefresh(user, refresh);
  }

  private async sessionFromRefresh(
    user: Parameters<typeof publicUser>[0],
    refresh: { token: string; expiresAt: Date },
  ) {
    return {
      user: publicUser(user),
      accessToken: await this.tokens.createAccessToken(user),
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt,
    };
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return isDuplicateEntryError(error);
}

export type AuthSession = Awaited<ReturnType<AuthService['login']>>;
