import type { LoginInput, RegisterInput, User } from '@practice-works/shared';

import { AuthError } from './errors.js';
import { hashPassword, verifyPassword } from './password.js';
import type { TokenService } from './tokens.js';
import type { UsersRepository } from '../repositories/users.repository.js';

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
  ) {}

  async register(input: RegisterInput) {
    const email = input.email.trim().toLowerCase();
    if (await this.users.findByEmail(email)) {
      throw new AuthError('An account with this email already exists', 'EMAIL_TAKEN');
    }

    const user = await this.users.create({
      email,
      username: input.username.trim(),
      passwordHash: await hashPassword(input.password),
    });
    return this.issueSession(user);
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
    return {
      user: publicUser(user),
      accessToken: await this.tokens.createAccessToken(user),
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt,
    };
  }
}

export type AuthSession = Awaited<ReturnType<AuthService['login']>>;
