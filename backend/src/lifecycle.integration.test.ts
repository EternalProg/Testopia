import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { eq, inArray } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CreateQuestionInput } from '@practice-works/shared';

import { createAuthServices } from './auth/factory.js';
import { buildApp } from './app.js';
import { createDatabase } from './db/client.js';
import { assertTestDatabaseUrl } from './db/config.js';
import { allQuestionFixtures, openEndedQuestionFixture } from './db/fixtures.js';
import {
  answerOptions,
  answerRecords,
  questions,
  refreshTokens,
  testAttempts,
  tests,
  users,
} from './db/schema.js';

const enabled = process.env.RUN_MYSQL_INTEGRATION === '1';

describe('full lifecycle MySQL integration', () => {
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
  const tag = randomUUID().slice(0, 8);

  const userIds: number[] = [];
  const testIds: number[] = [];
  const state = {
    authorToken: '',
    takerToken: '',
    testId: 0,
    singleId: 0,
    multiId: 0,
    trueFalseId: 0,
    openId: 0,
    singleCorrect: 0,
    singleWrong: 0,
    multiCorrect: [] as number[],
    multiWrong: 0,
    trueFalseCorrect: 0,
    trueFalseWrong: 0,
    attemptId: 0,
  };

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  async function register(role: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `lifecycle-${role}-${tag}@example.com`,
        username: `lifecycle-${role}-${tag}`,
        password: 'password123',
      },
    });
    expect(response.statusCode).toBe(201);
    const session = response.json();
    userIds.push(session.user.id);
    return session as { accessToken: string; user: { id: number } };
  }

  async function createQuestion(testId: number, token: string, payload: CreateQuestionInput) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tests/${testId}/questions`,
      headers: auth(token),
      payload,
    });
    expect(response.statusCode).toBe(201);
    return response.json();
  }

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: resolve(import.meta.dirname, './db/migrations') });
    await app.ready();
  });

  afterAll(async () => {
    if (testIds.length) {
      const attemptRows = await db
        .select({ id: testAttempts.id })
        .from(testAttempts)
        .where(inArray(testAttempts.testId, testIds));
      const attemptIds = attemptRows.map((row) => row.id);
      if (attemptIds.length) {
        await db.delete(answerRecords).where(inArray(answerRecords.attemptId, attemptIds));
        await db.delete(testAttempts).where(inArray(testAttempts.id, attemptIds));
      }
      const questionRows = await db
        .select({ id: questions.id })
        .from(questions)
        .where(inArray(questions.testId, testIds));
      const questionIds = questionRows.map((row) => row.id);
      if (questionIds.length) {
        await db.delete(answerOptions).where(inArray(answerOptions.questionId, questionIds));
        await db.delete(questions).where(inArray(questions.id, questionIds));
      }
      await db.delete(tests).where(inArray(tests.id, testIds));
    }
    if (userIds.length) {
      await db.delete(refreshTokens).where(inArray(refreshTokens.userId, userIds));
      await db.delete(users).where(inArray(users.id, userIds));
    }
    await app.close();
    await pool.end();
  });

  it('runs register -> create -> question CRUD -> publish -> answer -> result -> history -> statistics', async () => {
    const author = await register('author');
    const taker = await register('taker');
    state.authorToken = author.accessToken;
    state.takerToken = taker.accessToken;

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/tests',
      headers: auth(state.authorToken),
      payload: { title: `Lifecycle test ${tag}` },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().test.isPublished).toBe(false);
    state.testId = created.json().test.id;
    testIds.push(state.testId);

    const [singlePayload, multiPayload, trueFalsePayload, openPayload] = allQuestionFixtures();
    const single = await createQuestion(state.testId, state.authorToken, singlePayload);
    const multi = await createQuestion(state.testId, state.authorToken, multiPayload);
    const trueFalse = await createQuestion(state.testId, state.authorToken, trueFalsePayload);
    const open = await createQuestion(state.testId, state.authorToken, openPayload);

    // Question CRUD: update text, delete + recreate.
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tests/${state.testId}/questions/${single.id}`,
      headers: auth(state.authorToken),
      payload: { text: 'What is 2 + 2 (edited)?' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().text).toBe('What is 2 + 2 (edited)?');

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tests/${state.testId}/questions/${open.id}`,
      headers: auth(state.authorToken),
    });
    expect(removed.statusCode).toBe(204);
    const recreated = await createQuestion(
      state.testId,
      state.authorToken,
      openEndedQuestionFixture,
    );

    state.singleId = single.id;
    state.multiId = multi.id;
    state.trueFalseId = trueFalse.id;
    state.openId = recreated.id;
    const byCorrectness = (options: Array<{ id: number; isCorrect?: boolean }>) => ({
      correct: options.filter((option) => option.isCorrect).map((option) => option.id),
      wrong: options.filter((option) => !option.isCorrect).map((option) => option.id),
    });
    const singleSplit = byCorrectness(single.options);
    const multiSplit = byCorrectness(multi.options);
    const trueFalseSplit = byCorrectness(trueFalse.options);
    state.singleCorrect = singleSplit.correct[0]!;
    state.singleWrong = singleSplit.wrong[0]!;
    state.multiCorrect = multiSplit.correct;
    state.multiWrong = multiSplit.wrong[0]!;
    state.trueFalseCorrect = trueFalseSplit.correct[0]!;
    state.trueFalseWrong = trueFalseSplit.wrong[0]!;
    expect(state.multiCorrect.length).toBeGreaterThanOrEqual(1);

    const draftRead = await app.inject({
      method: 'GET',
      url: `/api/v1/tests/${state.testId}`,
      headers: auth(state.authorToken),
    });
    expect(draftRead.statusCode).toBe(200);
    expect(draftRead.json().questions).toHaveLength(4);

    const publish = await app.inject({
      method: 'POST',
      url: `/api/v1/tests/${state.testId}/publish`,
      headers: auth(state.authorToken),
    });
    expect(publish.statusCode).toBe(200);
    expect(publish.json().test.isPublished).toBe(true);

    // Published tests redact answer correctness for anonymous readers.
    const publicRead = await app.inject({ method: 'GET', url: `/api/v1/tests/${state.testId}` });
    expect(publicRead.statusCode).toBe(200);
    for (const question of publicRead.json().questions) {
      for (const option of question.options) {
        expect(option).not.toHaveProperty('isCorrect');
      }
    }

    const started = await app.inject({
      method: 'POST',
      url: `/api/v1/tests/${state.testId}/attempts`,
      headers: auth(state.takerToken),
    });
    expect(started.statusCode).toBe(201);
    expect(started.json().questions).toHaveLength(4);
    state.attemptId = started.json().attempt.id;

    // Single correct, multi correct, true/false wrong, open-ended ungraded:
    // 2/3 auto-graded correct -> 0.67.
    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/attempts/${state.attemptId}/submit`,
      headers: auth(state.takerToken),
      payload: {
        answers: [
          { questionId: state.singleId, selectedOptionIds: [state.singleCorrect] },
          { questionId: state.multiId, selectedOptionIds: state.multiCorrect },
          { questionId: state.trueFalseId, selectedOptionIds: [state.trueFalseWrong] },
          { questionId: state.openId, textAnswer: 'Because of Rayleigh scattering' },
        ],
      },
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json().attempt.score).toBe(0.67);
    expect(submitted.json().answersRevealed).toBe(true);
    const submittedById = new Map(
      submitted.json().answers.map((answer: { questionId: number }) => [answer.questionId, answer]),
    );
    expect(submittedById.get(state.singleId)).toMatchObject({ isCorrect: true });
    expect(submittedById.get(state.multiId)).toMatchObject({ isCorrect: true });
    expect(submittedById.get(state.trueFalseId)).toMatchObject({ isCorrect: false });
    expect(submittedById.get(state.openId)).toMatchObject({ isCorrect: null });

    const result = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${state.attemptId}/result`,
      headers: auth(state.takerToken),
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().attempt.score).toBe(0.67);
    expect(result.json().answersRevealed).toBe(true);

    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/tests/${state.testId}/attempts`,
      headers: auth(state.takerToken),
    });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toHaveLength(1);
    expect(history.json()[0]).toMatchObject({ id: state.attemptId, score: 0.67 });

    const statistics = await app.inject({
      method: 'GET',
      url: `/api/v1/tests/${state.testId}/statistics`,
      headers: auth(state.authorToken),
    });
    expect(statistics.statusCode).toBe(200);
    expect(statistics.json()).toMatchObject({
      testId: state.testId,
      attemptsCount: 1,
      completedAttemptsCount: 1,
      averageScore: 0.67,
    });
  });

  it('expires late submits with 410 while persisting the score', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/tests',
      headers: auth(state.authorToken),
      payload: { title: `Expiring test ${tag}`, timeLimitMinutes: 1 },
    });
    expect(created.statusCode).toBe(201);
    const expiringId = created.json().test.id;
    testIds.push(expiringId);

    const single = await createQuestion(expiringId, state.authorToken, allQuestionFixtures()[0]!);
    const correctId = single.options.find((option: { isCorrect?: boolean }) => option.isCorrect).id;

    const publish = await app.inject({
      method: 'POST',
      url: `/api/v1/tests/${expiringId}/publish`,
      headers: auth(state.authorToken),
    });
    expect(publish.statusCode).toBe(200);

    const started = await app.inject({
      method: 'POST',
      url: `/api/v1/tests/${expiringId}/attempts`,
      headers: auth(state.takerToken),
    });
    expect(started.statusCode).toBe(201);
    const attemptId = started.json().attempt.id;

    // Deterministic expiry: backdate startedAt instead of sleeping.
    await db
      .update(testAttempts)
      .set({ startedAt: new Date(Date.now() - 120_000) })
      .where(eq(testAttempts.id, attemptId));

    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/attempts/${attemptId}/submit`,
      headers: auth(state.takerToken),
      payload: { answers: [{ questionId: single.id, selectedOptionIds: [correctId] }] },
    });
    expect(submitted.statusCode).toBe(410);
    expect(submitted.json()).toMatchObject({ error: 'EXPIRED' });
    expect(submitted.json().attempt).toMatchObject({ id: attemptId, status: 'expired', score: 1 });

    const stored = await db.select().from(testAttempts).where(eq(testAttempts.id, attemptId));
    expect(stored[0]).toMatchObject({ status: 'expired', score: 1 });

    const result = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${attemptId}/result`,
      headers: auth(state.takerToken),
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().attempt).toMatchObject({ status: 'expired', score: 1 });
  });

  it('rejects takers on draft, mutate, and statistics paths', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/tests',
      headers: auth(state.authorToken),
      payload: { title: `Draft-only test ${tag}` },
    });
    expect(created.statusCode).toBe(201);
    const draftId = created.json().test.id;
    testIds.push(draftId);

    // Drafts are 404-masked from non-managers, including anonymous readers.
    for (const headers of [undefined, auth(state.takerToken)]) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/tests/${draftId}`,
        ...(headers ? { headers } : {}),
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: 'NOT_FOUND' });
    }

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tests/${draftId}`,
      headers: auth(state.takerToken),
      payload: { title: 'Hijacked title' },
    });
    expect(patch.statusCode).toBe(403);
    expect(patch.json()).toMatchObject({ error: 'FORBIDDEN' });

    const addQuestion = await app.inject({
      method: 'POST',
      url: `/api/v1/tests/${draftId}/questions`,
      headers: auth(state.takerToken),
      payload: allQuestionFixtures()[0],
    });
    expect(addQuestion.statusCode).toBe(403);
    expect(addQuestion.json()).toMatchObject({ error: 'FORBIDDEN' });

    const remove = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tests/${draftId}`,
      headers: auth(state.takerToken),
    });
    expect(remove.statusCode).toBe(403);

    const takerStats = await app.inject({
      method: 'GET',
      url: `/api/v1/tests/${state.testId}/statistics`,
      headers: auth(state.takerToken),
    });
    expect(takerStats.statusCode).toBe(403);
    expect(takerStats.json()).toMatchObject({ error: 'FORBIDDEN' });

    const missingStats = await app.inject({
      method: 'GET',
      url: '/api/v1/tests/999999999/statistics',
      headers: auth(state.authorToken),
    });
    expect(missingStats.statusCode).toBe(404);
  });

  it('redacts hidden answers mapping-time-only with DB rows intact', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/tests',
      headers: auth(state.authorToken),
      payload: { title: `Hidden test ${tag}`, showAnswersAfterCompletion: false },
    });
    expect(created.statusCode).toBe(201);
    const hiddenId = created.json().test.id;
    testIds.push(hiddenId);

    const single = await createQuestion(hiddenId, state.authorToken, allQuestionFixtures()[0]!);
    const correctId = single.options.find((option: { isCorrect?: boolean }) => option.isCorrect).id;
    const publish = await app.inject({
      method: 'POST',
      url: `/api/v1/tests/${hiddenId}/publish`,
      headers: auth(state.authorToken),
    });
    expect(publish.statusCode).toBe(200);

    const started = await app.inject({
      method: 'POST',
      url: `/api/v1/tests/${hiddenId}/attempts`,
      headers: auth(state.takerToken),
    });
    expect(started.statusCode).toBe(201);

    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/attempts/${started.json().attempt.id}/submit`,
      headers: auth(state.takerToken),
      payload: { answers: [{ questionId: single.id, selectedOptionIds: [correctId] }] },
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json().answersRevealed).toBe(false);
    expect(submitted.json().attempt.score).toBeNull();
    expect(submitted.json().answers).toHaveLength(1);
    expect(submitted.json().answers[0].isCorrect).toBeNull();

    const result = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${started.json().attempt.id}/result`,
      headers: auth(state.takerToken),
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().attempt.score).toBeNull();

    // Managers still see the real score; persisted rows keep their verdicts.
    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/tests/${hiddenId}/attempts`,
      headers: auth(state.authorToken),
    });
    expect(history.statusCode).toBe(200);
    expect(history.json()[0].score).toBe(1);

    const storedAttempt = await db
      .select()
      .from(testAttempts)
      .where(eq(testAttempts.id, started.json().attempt.id));
    expect(Number(storedAttempt[0]?.score)).toBe(1);
    const storedAnswers = await db
      .select()
      .from(answerRecords)
      .where(eq(answerRecords.attemptId, started.json().attempt.id));
    expect(storedAnswers).toHaveLength(1);
    expect(Number(storedAnswers[0]?.isCorrect)).toBe(1);
  });
});
