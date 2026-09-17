import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { eq, inArray } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '../db/client.js';
import { assertTestDatabaseUrl } from '../db/config.js';
import {
  answerOptions,
  answerRecords,
  questions,
  testAttempts,
  tests,
  users,
} from '../db/schema.js';
import { StatisticsRepository } from '../repositories/statistics.repository.js';
import { TestsRepository } from '../repositories/tests.repository.js';
import { StatisticsService } from './service.js';

const enabled = process.env.RUN_MYSQL_INTEGRATION === '1';

describe('statistics MySQL integration', () => {
  if (!enabled) {
    it.skip('requires RUN_MYSQL_INTEGRATION=1', () => undefined);
    return;
  }

  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required for MySQL integration tests');
  assertTestDatabaseUrl(databaseUrl);

  const { db, pool } = createDatabase(databaseUrl);
  const service = new StatisticsService(new StatisticsRepository(db), new TestsRepository(db));

  let authorId = 0;
  let takerId = 0;
  let testId = 0;
  let singleId = 0;
  let multiId = 0;
  let openId = 0;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: resolve(import.meta.dirname, '../db/migrations') });

    const tag = randomUUID().slice(0, 8);
    const authorInsert = await db.insert(users).values({
      email: `stats-author-${tag}@example.com`,
      username: `stats-author-${tag}`,
      passwordHash: 'integration-hash',
    });
    authorId = Number(authorInsert[0].insertId);
    const takerInsert = await db.insert(users).values({
      email: `stats-taker-${tag}@example.com`,
      username: `stats-taker-${tag}`,
      passwordHash: 'integration-hash',
    });
    takerId = Number(takerInsert[0].insertId);

    const testInsert = await db.insert(tests).values({
      title: 'Statistics integration test',
      description: null,
      authorId,
      isPublished: true,
      shuffleQuestions: false,
      timeLimitMinutes: null,
      showAnswersAfterCompletion: true,
    });
    testId = Number(testInsert[0].insertId);

    async function addQuestion(
      text: string,
      type: 'single_choice' | 'multiple_choice' | 'open_ended',
      orderIndex: number,
    ) {
      const inserted = await db.insert(questions).values({ testId, text, type, orderIndex });
      return Number(inserted[0].insertId);
    }

    singleId = await addQuestion('Single?', 'single_choice', 0);
    multiId = await addQuestion('Multi?', 'multiple_choice', 1);
    openId = await addQuestion('Open?', 'open_ended', 2);

    const singleCorrect = Number(
      (
        await db
          .insert(answerOptions)
          .values({ questionId: singleId, text: 'yes', isCorrect: true })
      )[0].insertId,
    );
    const singleWrong = Number(
      (
        await db
          .insert(answerOptions)
          .values({ questionId: singleId, text: 'no', isCorrect: false })
      )[0].insertId,
    );
    const multiCorrect = await Promise.all(
      ['a', 'b'].map(async (text) =>
        Number(
          (await db.insert(answerOptions).values({ questionId: multiId, text, isCorrect: true }))[0]
            .insertId,
        ),
      ),
    );
    const multiWrong = Number(
      (
        await db.insert(answerOptions).values({ questionId: multiId, text: 'c', isCorrect: false })
      )[0].insertId,
    );

    async function addAttempt(
      status: 'completed' | 'expired' | 'in_progress',
      score: number | null,
      time: number | null,
    ) {
      const inserted = await db.insert(testAttempts).values({
        userId: takerId,
        testId,
        status,
        score,
        timeSpentSeconds: time,
        completedAt: status === 'in_progress' ? null : new Date(),
      });
      return Number(inserted[0].insertId);
    }

    // Attempt A: completed, score 1. Multi-choice persists one row per option.
    const attemptA = await addAttempt('completed', 1, 100);
    await db.insert(answerRecords).values([
      {
        attemptId: attemptA,
        questionId: singleId,
        selectedOptionId: singleCorrect,
        isCorrect: true,
      },
      ...multiCorrect.map((optionId) => ({
        attemptId: attemptA,
        questionId: multiId,
        selectedOptionId: optionId,
        isCorrect: true,
      })),
      {
        attemptId: attemptA,
        questionId: openId,
        selectedOptionId: null,
        textAnswer: 'hello',
        isCorrect: null,
      },
    ]);
    // Attempt B: completed, score 0.
    const attemptB = await addAttempt('completed', 0, 50);
    await db.insert(answerRecords).values([
      {
        attemptId: attemptB,
        questionId: singleId,
        selectedOptionId: singleWrong,
        isCorrect: false,
      },
      { attemptId: attemptB, questionId: multiId, selectedOptionId: multiWrong, isCorrect: false },
    ]);
    // Attempt C: expired, score 0.5.
    const attemptC = await addAttempt('expired', 0.5, 90);
    await db.insert(answerRecords).values({
      attemptId: attemptC,
      questionId: singleId,
      selectedOptionId: singleCorrect,
      isCorrect: true,
    });
    // Attempt D: in progress, counted but excluded from averages.
    await addAttempt('in_progress', null, null);
  });

  afterAll(async () => {
    const attemptRows = await db
      .select({ id: testAttempts.id })
      .from(testAttempts)
      .where(eq(testAttempts.testId, testId));
    const attemptIds = attemptRows.map((row) => row.id);
    if (attemptIds.length) {
      await db.delete(answerRecords).where(inArray(answerRecords.attemptId, attemptIds));
      await db.delete(testAttempts).where(inArray(testAttempts.id, attemptIds));
    }
    const questionRows = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.testId, testId));
    const questionIds = questionRows.map((row) => row.id);
    if (questionIds.length) {
      await db.delete(answerOptions).where(inArray(answerOptions.questionId, questionIds));
      await db.delete(questions).where(inArray(questions.id, questionIds));
    }
    await db.delete(tests).where(eq(tests.id, testId));
    await db.delete(users).where(inArray(users.id, [authorId, takerId]));
    await pool.end();
  });

  it('aggregates attempt summaries over terminal attempts only', async () => {
    const repository = new StatisticsRepository(db);
    const summary = await repository.getAttemptSummary(testId);

    expect(summary.total).toBe(4);
    expect(summary.completed).toBe(2);
    // AVG() over decimals returns strings via mysql2; the service coerces them.
    expect(Number(summary.avgScore)).toBeCloseTo(0.5, 5);
    expect(Number(summary.avgTime)).toBeCloseTo(80, 5);

    const scores = await repository.listTerminalScores(testId);
    expect([...scores].map(Number).sort()).toEqual([0, 0.5, 1]);
  });

  it('dedupes multi-choice rows per attempt in question correctness', async () => {
    const repository = new StatisticsRepository(db);
    const rows = await repository.getQuestionCorrectness(testId);
    const byId = new Map(rows.map((row) => [row.questionId, row]));

    // Two option rows from one attempt count as a single attempt.
    expect(byId.get(singleId)).toMatchObject({ attempts: 3, correctAnswers: 2 });
    expect(byId.get(multiId)).toMatchObject({ attempts: 2, correctAnswers: 1 });
    // The ungraded open-ended record (isCorrect null) is excluded entirely.
    expect(byId.has(openId)).toBe(false);
  });

  it('computes manager statistics end to end and rejects takers and missing tests', async () => {
    const stats = await service.getStatistics({ id: authorId, role: 'user' }, testId);

    expect(stats).toMatchObject({
      testId,
      attemptsCount: 4,
      completedAttemptsCount: 2,
      averageScore: 0.5,
      averageTimeSeconds: 80,
    });
    expect(stats.scoreDistribution).toHaveLength(10);
    expect(stats.scoreDistribution.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(3);
    expect(stats.scoreDistribution[9]).toMatchObject({ min: 90, max: 100, count: 1 });
    expect(stats.scoreDistribution[5]).toMatchObject({ min: 50, max: 60, count: 1 });
    expect(stats.scoreDistribution[0]).toMatchObject({ min: 0, max: 10, count: 1 });
    expect(stats.questionStats.map((row) => row.questionId)).toEqual([singleId, multiId, openId]);
    expect(stats.questionStats[0]).toMatchObject({
      text: 'Single?',
      attempts: 3,
      correctAnswers: 2,
      correctnessRate: 0.67,
    });
    expect(stats.questionStats[2]).toMatchObject({
      text: 'Open?',
      attempts: 0,
      correctAnswers: 0,
      correctnessRate: null,
    });

    await expect(
      service.getStatistics({ id: takerId, role: 'user' }, testId),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      service.getStatistics({ id: authorId, role: 'user' }, 999_999_999),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
