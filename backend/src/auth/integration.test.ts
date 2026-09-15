import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { createDatabase } from '../db/client.js';
import { assertTestDatabaseUrl } from '../db/config.js';
import {
  answerOptions,
  answerRecords,
  questions,
  refreshTokens,
  testAttempts,
  tests,
  users,
} from '../db/schema.js';
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
  if (!process.env.JWT_ACCESS_SECRET) {
    throw new Error('JWT_ACCESS_SECRET is required for MySQL integration tests');
  }
  if (!process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET is required for MySQL integration tests');
  }

  const { db, pool } = createDatabase(databaseUrl);
  const app = buildApp({ auth: createAuthServices(db) });

  async function cleanupDatabase() {
    await db.delete(answerRecords);
    await db.delete(testAttempts);
    await db.delete(answerOptions);
    await db.delete(questions);
    await db.delete(tests);
    await db.delete(refreshTokens);
    await db.delete(users);
  }

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: resolve(import.meta.dirname, '../db/migrations') });
    await cleanupDatabase();
    await app.ready();
  });

  afterAll(async () => {
    await cleanupDatabase();
    await app.close();
    await pool.end();
  });

  it('registers, authenticates, rotates, and revokes a database-backed session', async () => {
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `integration-${randomUUID()}@example.com`,
        username: `integration-${randomUUID().slice(0, 8)}`,
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

  it('allows only one concurrent refresh rotation through MySQL', async () => {
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `concurrent-${randomUUID()}@example.com`,
        username: `concurrent-${randomUUID().slice(0, 8)}`,
        password: 'password123',
      },
    });
    const session = register.json();

    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: session.refreshToken },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: session.refreshToken },
      }),
    ]);
    const statuses = responses.map((response) => response.statusCode).sort();
    const storedTokens = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, session.user.id));

    expect(register.statusCode).toBe(201);
    expect(statuses).toEqual([200, 401]);
    expect(storedTokens).toHaveLength(2);
    expect(storedTokens.filter((token) => token.revokedAt)).toHaveLength(1);
    expect(storedTokens.filter((token) => !token.revokedAt)).toHaveLength(1);
  });

  it('creates, publishes, and reads a test without exposing answer correctness', async () => {
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `tests-${randomUUID()}@example.com`,
        username: `tests-${randomUUID().slice(0, 8)}`,
        password: 'password123',
      },
    });
    const session = register.json();
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/tests',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { title: 'Integration test' },
    });
    const testId = created.json().test.id;
    const question = await app.inject({
      method: 'POST',
      url: `/api/v1/tests/${testId}/questions`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        text: 'Two plus two?',
        type: 'single_choice',
        orderIndex: 0,
        options: [
          { text: '4', isCorrect: true },
          { text: '5', isCorrect: false },
        ],
      },
    });
    const publish = await app.inject({
      method: 'POST',
      url: `/api/v1/tests/${testId}/publish`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    const publicRead = await app.inject({ method: 'GET', url: `/api/v1/tests/${testId}` });

    expect(created.statusCode).toBe(201);
    expect(question.statusCode).toBe(201);
    expect(publish.statusCode).toBe(200);
    expect(publicRead.statusCode).toBe(200);
    expect(publicRead.json().questions[0].options[0]).not.toHaveProperty('isCorrect');
  });
});
