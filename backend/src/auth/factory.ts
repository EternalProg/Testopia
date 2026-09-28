import type { Database } from '../db/client.js';
import type { RedisClient } from '../redis/client.js';
import { RefreshTokensRepository } from '../repositories/refresh-tokens.repository.js';
import { UsersRepository } from '../repositories/users.repository.js';
import { getTokenConfig } from './config.js';
import { AuthService } from './service.js';
import { TokenService } from './tokens.js';

export function createAuthServices(db: Database, redis: RedisClient) {
  const users = new UsersRepository(db);
  const refreshTokens = new RefreshTokensRepository(redis);
  const tokens = new TokenService(getTokenConfig(), refreshTokens);
  return { service: new AuthService(users, tokens), tokens, database: db };
}
