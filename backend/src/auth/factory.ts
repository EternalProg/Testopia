import type { Database } from '../db/client.js';
import { RefreshTokensRepository } from '../repositories/refresh-tokens.repository.js';
import { UsersRepository } from '../repositories/users.repository.js';
import { getTokenConfig } from './config.js';
import { AuthService } from './service.js';
import { TokenService } from './tokens.js';

export function createAuthServices(db: Database) {
  const users = new UsersRepository(db);
  const refreshTokens = new RefreshTokensRepository(db);
  const tokens = new TokenService(getTokenConfig(), refreshTokens);
  return { service: new AuthService(users, tokens, db), tokens, database: db };
}
