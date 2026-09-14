import { describe, expect, it, vi } from 'vitest';

import type { UsersRepository } from '../repositories/users.repository.js';
import { AuthError } from './errors.js';
import { hashPassword } from './password.js';
import { AuthService } from './service.js';
import type { TokenService } from './tokens.js';

const user = {
  id: 1,
  email: 'user@example.com',
  username: 'user',
  passwordHash: '$2b$04$abcdefghijklmnopqrstuu7yXq4g4N0B5M9Y1aJw5j3f8K2N0A',
  role: 'user' as const,
  createdAt: new Date(),
};

function setup() {
  const users = {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  } as unknown as UsersRepository;
  const tokens = {
    createAccessToken: vi.fn().mockResolvedValue('access-token'),
    createRefreshToken: vi
      .fn()
      .mockResolvedValue({ token: 'refresh-token', id: 'refresh-id', expiresAt: new Date() }),
    rotateRefreshToken: vi.fn(),
    revokeRefreshToken: vi.fn(),
  } as unknown as TokenService;
  return { service: new AuthService(users, tokens), users, tokens };
}

describe('AuthService', () => {
  it('registers a user and returns a public session', async () => {
    const { service, users } = setup();
    vi.mocked(users.findByEmail).mockResolvedValue(null);
    vi.mocked(users.create).mockResolvedValue(user);

    const session = await service.register({
      email: ' USER@example.com ',
      username: 'user',
      password: 'password123',
    });

    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com' }),
    );
    expect(session.user).toEqual(expect.not.objectContaining({ passwordHash: expect.anything() }));
    expect(session.accessToken).toBe('access-token');
  });

  it('rejects duplicate registration and invalid login credentials', async () => {
    const duplicate = setup();
    vi.mocked(duplicate.users.findByEmail).mockResolvedValue(user);
    await expect(
      duplicate.service.register({ email: user.email, username: 'user', password: 'password123' }),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });

    const invalid = setup();
    vi.mocked(invalid.users.findByEmail).mockResolvedValue(null);
    await expect(
      invalid.service.login({ email: user.email, password: 'wrong' }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('logs in, refreshes, logs out, and loads the current user', async () => {
    const { service, users, tokens } = setup();
    vi.mocked(users.findByEmail).mockResolvedValue(user);
    vi.mocked(users.findById).mockResolvedValue(user);
    vi.mocked(tokens.rotateRefreshToken).mockResolvedValue({
      userId: user.id,
      token: 'new-refresh',
      expiresAt: new Date(),
    });

    await expect(service.login({ email: user.email, password: 'wrong' })).rejects.toBeInstanceOf(
      AuthError,
    );
    user.passwordHash = await hashPassword('correct-password');
    await expect(
      service.login({ email: user.email, password: 'correct-password' }),
    ).resolves.toMatchObject({
      accessToken: 'access-token',
    });
    await service.logout('refresh-token');
    await expect(service.currentUser(user.id)).resolves.toEqual(
      expect.objectContaining({ id: user.id }),
    );
    await expect(service.refresh('refresh-token')).resolves.toEqual(
      expect.objectContaining({ refreshToken: 'new-refresh' }),
    );
    expect(tokens.revokeRefreshToken).toHaveBeenCalledWith('refresh-token');
  });

  it('returns unauthorized when the current user no longer exists', async () => {
    const { service, users } = setup();
    vi.mocked(users.findById).mockResolvedValue(null);

    await expect(service.currentUser(404)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
