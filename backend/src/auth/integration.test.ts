import { resolve } from 'node:path';

import { migrate } from 'drizzle-orm/mysql2/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createDatabase } from '../db/client.js';
import { assertTestDatabaseUrl } from '../db/config.js';
import { refreshTokens, users } from '../db/schema.js';
import { createAuthServices } from './factory.js';

const enabled = process.env.RUN_MYSQL_INTEGRATION === '1';

describe('authentication MySQL integration', () => {
  if (!enabled) {
    it.skip('requires RUN_MYSQL_INTEGRATION=1', () => undefined);
    return;
  }

  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required for MySQL integration tests');
  assertTestDatabaseUrl(databaseUrl);
  process.env.JWT_ACCESS_SECRET ??= 'integration-access-secret-that-is-long-enough';
  process.env.JWT_REFRESH_SECRET ??= 'integration-refresh-secret-that-is-long-enough';

  const { db, pool } = createDatabase(databaseUrl);
  const app = buildApp({ auth: createAuthServices(db) });

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: resolve(import.meta.dirname, '../db/migrations') });
    await db.delete(refreshTokens);
    await db.delete(users);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('registers, authenticates, rotates, and revokes a database-backed session', async () => {
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'integration@example.com',
        username: 'integration',
        password: 'password123',
      },
    });
    const session = register.json();
    const current = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });

    expect(register.statusCode).toBe(201);
    expect(current.statusCode).toBe(200);
    expect(refresh.statusCode).toBe(200);
    expect(replay.statusCode).toBe(401);
  });
});
