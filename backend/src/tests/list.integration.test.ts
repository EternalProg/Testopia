import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { inArray } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '../db/client.js';
import { assertTestDatabaseUrl } from '../db/config.js';
import { testAttempts, tests, users } from '../db/schema.js';
import { TestsRepository } from '../repositories/tests.repository.js';

const enabled = process.env.RUN_MYSQL_INTEGRATION === '1';

describe('test list MySQL integration', () => {
  if (!enabled) {
    it.skip('requires RUN_MYSQL_INTEGRATION=1', () => undefined);
    return;
  }

  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required for MySQL integration tests');
  assertTestDatabaseUrl(databaseUrl);

  const { db, pool } = createDatabase(databaseUrl);
  const repository = new TestsRepository(db);

  let authorId = 0;
  let takerId = 0;
  let tag = '';
  // Oldest to newest by createdAt.
  let testA = 0;
  let testB = 0;
  let testC = 0;
  let draftId = 0;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: resolve(import.meta.dirname, '../db/migrations') });

    tag = randomUUID().slice(0, 8);
    authorId = Number(
      (
        await db.insert(users).values({
          email: `list-author-${tag}@example.com`,
          username: `list-author-${tag}`,
          passwordHash: 'integration-hash',
        })
      )[0].insertId,
    );
    takerId = Number(
      (
        await db.insert(users).values({
          email: `list-taker-${tag}@example.com`,
          username: `list-taker-${tag}`,
          passwordHash: 'integration-hash',
        })
      )[0].insertId,
    );

    async function addTest(title: string, createdAt: string, isPublished = true) {
      return Number(
        (
          await db.insert(tests).values({
            title,
            description: null,
            authorId,
            isPublished,
            shuffleQuestions: false,
            timeLimitMinutes: null,
            showAnswersAfterCompletion: true,
            createdAt: new Date(createdAt),
          })
        )[0].insertId,
      );
    }

    testA = await addTest(`List A ${tag}`, '2026-01-01T00:00:00.000Z');
    testB = await addTest(`List B ${tag}`, '2026-01-02T00:00:00.000Z');
    testC = await addTest(`List C ${tag}`, '2026-01-03T00:00:00.000Z');
    draftId = await addTest(`List draft ${tag}`, '2026-01-04T00:00:00.000Z', false);

    async function addAttempt(
      testId: number,
      status: 'completed' | 'expired' | 'in_progress',
      score: number | null,
    ) {
      await db.insert(testAttempts).values({
        userId: takerId,
        testId,
        status,
        score,
        timeSpentSeconds: 60,
        completedAt: status === 'in_progress' ? null : new Date(),
      });
    }

    // A: two terminal attempts averaging 0.5 plus an in-progress attempt
    // (counts toward popularity, excluded from the hardest average).
    await addAttempt(testA, 'completed', 0.5);
    await addAttempt(testA, 'expired', 0.5);
    await addAttempt(testA, 'in_progress', 0);
    // B: one terminal 0.3 plus an in-progress 1 that must NOT leak into the
    // hardest average (0.3 keeps B hardest; 0.65 would rank it after A).
    await addAttempt(testB, 'completed', 0.3);
    await addAttempt(testB, 'in_progress', 1);
    // C: no attempts — least popular and last under hardest (nulls last).
  });

  afterAll(async () => {
    const testIds = [testA, testB, testC, draftId];
    const attemptRows = await db
      .select({ id: testAttempts.id })
      .from(testAttempts)
      .where(inArray(testAttempts.testId, testIds));
    const attemptIds = attemptRows.map((row) => row.id);
    if (attemptIds.length) {
      await db.delete(testAttempts).where(inArray(testAttempts.id, attemptIds));
    }
    await db.delete(tests).where(inArray(tests.id, testIds));
    await db.delete(users).where(inArray(users.id, [authorId, takerId]));
    await pool.end();
  });

  it('lists newest first by default and hides drafts from the public view', async () => {
    const rows = await repository.list({ publishedOnly: true, search: tag });

    expect(rows.map((row) => row.id)).toEqual([testC, testB, testA]);
  });

  it('sorts by attempt count for popular', async () => {
    const rows = await repository.list({ publishedOnly: true, search: tag, sort: 'popular' });

    // A has 3 attempts, B has 2, C has none.
    expect(rows.map((row) => row.id)).toEqual([testA, testB, testC]);
  });

  it('sorts by lowest average terminal score for hardest, unscored last', async () => {
    const rows = await repository.list({ publishedOnly: true, search: tag, sort: 'hardest' });

    // B averages 0.3, A averages 0.5, C has no terminal scores.
    expect(rows.map((row) => row.id)).toEqual([testB, testA, testC]);
  });

  it('slices pages with limit/offset and counts the same filtered set', async () => {
    const first = await repository.list({ publishedOnly: true, search: tag, limit: 2, offset: 0 });
    expect(first.map((row) => row.id)).toEqual([testC, testB]);

    const second = await repository.list({ publishedOnly: true, search: tag, limit: 2, offset: 2 });
    expect(second.map((row) => row.id)).toEqual([testA]);

    const beyond = await repository.list({
      publishedOnly: true,
      search: tag,
      limit: 2,
      offset: 20,
    });
    expect(beyond).toEqual([]);

    expect(await repository.count({ publishedOnly: true, search: tag })).toBe(3);
  });

  it('applies search and scope filters to both list and count', async () => {
    const [listed, total] = await Promise.all([
      repository.list({ publishedOnly: true, search: `List B ${tag}` }),
      repository.count({ publishedOnly: true, search: `List B ${tag}` }),
    ]);
    expect(listed.map((row) => row.id)).toEqual([testB]);
    expect(total).toBe(1);

    const mine = await repository.list({ authorId, publishedOnly: false });
    expect(mine.map((row) => row.id)).toContain(draftId);
    expect(await repository.count({ authorId, publishedOnly: false })).toBe(mine.length);
  });

  it('keeps popularity and difficulty ordering composed with filters', async () => {
    const rows = await repository.list({
      publishedOnly: true,
      search: tag,
      sort: 'popular',
      limit: 2,
      offset: 0,
    });

    expect(rows.map((row) => row.id)).toEqual([testA, testB]);
  });
});
