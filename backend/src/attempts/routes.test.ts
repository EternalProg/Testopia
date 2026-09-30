import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { AuthService } from '../auth/service.js';
import type { TokenService } from '../auth/tokens.js';
import type { Database } from '../db/client.js';

const state = vi.hoisted(() => {
  const questionFixtures = [
    {
      id: 11,
      testId: 1,
      text: 'Single',
      type: 'single_choice',
      orderIndex: 0,
      options: [
        { id: 101, questionId: 11, text: 'A', isCorrect: true },
        { id: 102, questionId: 11, text: 'B', isCorrect: false },
      ],
    },
    {
      id: 12,
      testId: 1,
      text: 'Multi',
      type: 'multiple_choice',
      orderIndex: 1,
      options: [
        { id: 103, questionId: 12, text: 'A', isCorrect: true },
        { id: 104, questionId: 12, text: 'B', isCorrect: true },
        { id: 105, questionId: 12, text: 'C', isCorrect: false },
      ],
    },
    {
      id: 13,
      testId: 3,
      text: 'Timed',
      type: 'single_choice',
      orderIndex: 0,
      options: [
        { id: 106, questionId: 13, text: 'A', isCorrect: true },
        { id: 107, questionId: 13, text: 'B', isCorrect: false },
      ],
    },
    {
      id: 14,
      testId: 4,
      text: 'Secret',
      type: 'single_choice',
      orderIndex: 0,
      options: [
        { id: 108, questionId: 14, text: 'A', isCorrect: true },
        { id: 109, questionId: 14, text: 'B', isCorrect: false },
      ],
    },
    {
      id: 15,
      testId: 1,
      text: 'Explain',
      type: 'open_ended',
      orderIndex: 2,
      options: [],
    },
  ];
  return {
    users: [
      { id: 7, username: 'taker-seven' },
      { id: 8, username: 'other-user' },
      { id: 10, username: 'test-author' },
    ],
    tests: [
      {
        id: 1,
        title: 'Published',
        description: null,
        authorId: 10,
        isPublished: true,
        shuffleQuestions: false,
        shuffleOptions: false,
        maxAttempts: null as number | null,
        questionCount: null as number | null,
        timeLimitMinutes: null as number | null,
        showAnswersAfterCompletion: true,
        showQuestionsBeforeStart: true,
        availableFrom: null as Date | null,
        availableUntil: null as Date | null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 2,
        title: 'Draft',
        description: null,
        authorId: 10,
        isPublished: false,
        shuffleQuestions: false,
        timeLimitMinutes: null as number | null,
        showAnswersAfterCompletion: true,
        showQuestionsBeforeStart: true,
        availableFrom: null as Date | null,
        availableUntil: null as Date | null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 3,
        title: 'Timed',
        description: null,
        authorId: 10,
        isPublished: true,
        shuffleQuestions: false,
        timeLimitMinutes: 60 as number | null,
        showAnswersAfterCompletion: true,
        showQuestionsBeforeStart: true,
        availableFrom: null as Date | null,
        availableUntil: null as Date | null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 4,
        title: 'Hidden',
        description: null,
        authorId: 10,
        isPublished: true,
        shuffleQuestions: false,
        timeLimitMinutes: null as number | null,
        showAnswersAfterCompletion: false,
        showQuestionsBeforeStart: true,
        availableFrom: null as Date | null,
        availableUntil: null as Date | null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    questions: questionFixtures,
    attempts: [] as Array<{
      id: number;
      userId: number;
      testId: number;
      status: 'in_progress' | 'completed' | 'expired';
      startedAt: Date;
      completedAt: Date | null;
      score: number | null;
      timeSpentSeconds: number | null;
    }>,
    orders: new Map<
      number,
      { questionIds: number[] | null; optionOrders: Map<number, number[]> }
    >(),
    nextAttemptId: 1,
    answerRecords: [] as Array<{
      id: number;
      attemptId: number;
      questionId: number;
      selectedOptionId: number | null;
      textAnswer: string | null;
      isCorrect: boolean | null;
    }>,
    nextRecordId: 1,
  };
});

vi.mock('../repositories/tests.repository.js', () => ({
  TestsRepository: class {
    async findById(id: number) {
      return state.tests.find((test) => test.id === id) ?? null;
    }
    async findQuestions(testId: number) {
      return state.questions.filter((question) => question.testId === testId);
    }
  },
}));

vi.mock('../repositories/attempts.repository.js', () => ({
  AttemptsRepository: class {
    async findActiveAttempt(userId: number, testId: number) {
      const active = state.attempts.filter(
        (attempt) =>
          attempt.userId === userId &&
          attempt.testId === testId &&
          attempt.status === 'in_progress',
      );
      return active[active.length - 1] ?? null;
    }
    async findAttemptById(id: number) {
      return state.attempts.find((attempt) => attempt.id === id) ?? null;
    }
    async findAnswerRecords(attemptId: number) {
      return state.answerRecords.filter((record) => record.attemptId === attemptId);
    }
    async listAttemptsByTest(testId: number, filter: { userId?: number } = {}) {
      return state.attempts
        .filter(
          (attempt) =>
            attempt.testId === testId &&
            (filter.userId === undefined || attempt.userId === filter.userId),
        )
        .map((attempt) => ({
          ...attempt,
          username: state.users.find((user) => user.id === attempt.userId)?.username ?? 'unknown',
        }))
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || b.id - a.id);
    }
    async countTerminalByUser(userId: number, testId: number) {
      return state.attempts.filter(
        (attempt) =>
          attempt.userId === userId &&
          attempt.testId === testId &&
          (attempt.status === 'completed' || attempt.status === 'expired'),
      ).length;
    }
    async findAttemptOrders(attemptId: number) {
      return state.orders.get(attemptId) ?? { questionIds: null, optionOrders: new Map() };
    }
    async findAttemptOrdersMany(attemptIds: number[]) {
      return new Map(
        attemptIds.map((attemptId) => [
          attemptId,
          state.orders.get(attemptId) ?? { questionIds: null, optionOrders: new Map() },
        ]),
      );
    }
    async createAttempt(input: {
      userId: number;
      testId: number;
      questionIds: number[];
      optionOrders: Record<number, number[]> | null;
    }) {
      const attempt = {
        id: state.nextAttemptId,
        status: 'in_progress' as const,
        startedAt: new Date(),
        completedAt: null,
        score: null,
        timeSpentSeconds: null,
        userId: input.userId,
        testId: input.testId,
      };
      state.nextAttemptId += 1;
      state.attempts.push(attempt);
      state.orders.set(attempt.id, {
        questionIds: input.questionIds,
        optionOrders: new Map(
          Object.entries(input.optionOrders ?? {}).map(([key, value]) => [Number(key), value]),
        ),
      });
      return attempt;
    }
    async completeAttempt(
      id: number,
      outcome: {
        status: 'completed' | 'expired';
        score: number | null;
        timeSpentSeconds: number;
        completedAt: Date;
      },
      answers: Array<{
        questionId: number;
        selectedOptionId: number | null;
        textAnswer: string | null;
        isCorrect: boolean | null;
      }> = [],
    ) {
      const attempt = state.attempts.find((candidate) => candidate.id === id);
      // Mirror the real repository's optimistic guard: only an in_progress
      // attempt can be completed; a concurrent winner makes this return null.
      if (!attempt || attempt.status !== 'in_progress') return null;
      Object.assign(attempt, outcome);
      for (const answer of answers) {
        state.answerRecords.push({ id: state.nextRecordId++, attemptId: id, ...answer });
      }
      return attempt;
    }
    async updateAnswerVerdicts(
      id: number,
      verdicts: Array<{ questionId: number; isCorrect: boolean }>,
      score: number | null,
    ) {
      const attempt = state.attempts.find((candidate) => candidate.id === id);
      if (!attempt) return null;
      for (const verdict of verdicts) {
        for (const record of state.answerRecords.filter(
          (candidate) => candidate.attemptId === id && candidate.questionId === verdict.questionId,
        )) {
          record.isCorrect = verdict.isCorrect;
        }
      }
      attempt.score = score;
      return attempt;
    }
  },
}));

const currentUser = vi.hoisted(() => ({ sub: '7', role: 'user' as 'user' | 'admin' }));

describe('attempt routes', () => {
  const tokens = {
    verifyAccessToken: vi.fn(async () => ({ ...currentUser, type: 'access' })),
  } as unknown as TokenService;
  const app = buildApp({
    auth: {
      service: {} as AuthService,
      tokens,
      database: {} as Database,
    },
  });
  const authHeaders = { authorization: 'Bearer test-token' };

  beforeAll(async () => app.ready());
  afterAll(async () => app.close());
  beforeEach(() => {
    state.attempts.length = 0;
    state.nextAttemptId = 1;
    state.answerRecords.length = 0;
    state.nextRecordId = 1;
    state.orders.clear();
    currentUser.sub = '7';
    currentUser.role = 'user';
  });

  it('requires authentication for attempt endpoints', async () => {
    const start = await app.inject({ method: 'POST', url: '/api/v1/tests/1/attempts' });
    const read = await app.inject({ method: 'GET', url: '/api/v1/attempts/1' });
    const result = await app.inject({ method: 'GET', url: '/api/v1/attempts/1/result' });
    const history = await app.inject({ method: 'GET', url: '/api/v1/tests/1/attempts' });
    const submit = await app.inject({
      method: 'POST',
      url: '/api/v1/attempts/1/submit',
      payload: { answers: [] },
    });

    expect(start.statusCode).toBe(401);
    expect(read.statusCode).toBe(401);
    expect(result.statusCode).toBe(401);
    expect(history.statusCode).toBe(401);
    expect(submit.statusCode).toBe(401);
  });

  it('returns 404 for missing or draft tests', async () => {
    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/tests/99/attempts',
      headers: authHeaders,
    });
    const draft = await app.inject({
      method: 'POST',
      url: '/api/v1/tests/2/attempts',
      headers: authHeaders,
    });

    expect(missing.statusCode).toBe(404);
    expect(draft.statusCode).toBe(404);
  });

  it('starts and resumes attempts with redacted options', async () => {
    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/tests/1/attempts',
      headers: authHeaders,
    });
    expect(started.statusCode).toBe(201);
    const first = started.json() as {
      attempt: { id: number };
      test: { id: number; title: string; timeLimitMinutes: number | null };
      questions: Array<{ id: number; options: object[] }>;
    };
    expect(first.test).toMatchObject({ id: 1, title: 'Published', timeLimitMinutes: null });
    expect(first.questions.map((question) => question.id)).toEqual([11, 12, 15]);

    const resumed = await app.inject({
      method: 'POST',
      url: '/api/v1/tests/1/attempts',
      headers: authHeaders,
    });
    expect(resumed.json()).toMatchObject({ attempt: { id: first.attempt.id } });

    const read = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${first.attempt.id}`,
      headers: authHeaders,
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({ attempt: { id: first.attempt.id, status: 'in_progress' } });
    expect(JSON.stringify(read.json())).not.toContain('isCorrect');
  });

  it('restricts attempt reads to the owner and admins', async () => {
    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/tests/1/attempts',
      headers: authHeaders,
    });
    const attemptId = (started.json() as { attempt: { id: number } }).attempt.id;

    currentUser.sub = '8';
    const forbidden = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${attemptId}`,
      headers: authHeaders,
    });
    expect(forbidden.statusCode).toBe(403);

    currentUser.role = 'admin';
    const admin = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${attemptId}`,
      headers: authHeaders,
    });
    expect(admin.statusCode).toBe(200);
  });

  it('scores submissions and rejects duplicate or foreign answers', async () => {
    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/tests/1/attempts',
      headers: authHeaders,
    });
    const attemptId = (started.json() as { attempt: { id: number } }).attempt.id;

    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/attempts/${attemptId}/submit`,
      headers: authHeaders,
      payload: {
        answers: [
          { questionId: 11, selectedOptionIds: [101] },
          { questionId: 12, selectedOptionIds: [103, 104] },
        ],
      },
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json()).toMatchObject({ attempt: { status: 'completed', score: 1 } });

    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/v1/attempts/${attemptId}/submit`,
      headers: authHeaders,
      payload: { answers: [] },
    });
    expect(duplicate.statusCode).toBe(409);

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/tests/1/attempts',
      headers: authHeaders,
    });
    const secondId = (second.json() as { attempt: { id: number } }).attempt.id;
    const foreign = await app.inject({
      method: 'POST',
      url: `/api/v1/attempts/${secondId}/submit`,
      headers: authHeaders,
      payload: { answers: [{ questionId: 999, selectedOptionIds: [] }] },
    });
    expect(foreign.statusCode).toBe(400);
  });

  it('marks late submits as expired with a 410 result', async () => {
    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/tests/3/attempts',
      headers: authHeaders,
    });
    const attemptId = (started.json() as { attempt: { id: number } }).attempt.id;
    const stored = state.attempts.find((attempt) => attempt.id === attemptId);
    stored!.startedAt = new Date(Date.now() - 61 * 60_000);

    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/attempts/${attemptId}/submit`,
      headers: authHeaders,
      payload: { answers: [{ questionId: 13, selectedOptionIds: [106] }] },
    });

    expect(submitted.statusCode).toBe(410);
    expect(submitted.json()).toMatchObject({
      error: 'EXPIRED',
      attempt: { id: attemptId, status: 'expired', score: 1 },
    });
  });

  it('rejects malformed ids', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/attempts/not-a-number',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
  });

  it('returns full results when answers are revealed', async () => {
    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/tests/1/attempts',
      headers: authHeaders,
    });
    const attemptId = (started.json() as { attempt: { id: number } }).attempt.id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/attempts/${attemptId}/submit`,
      headers: authHeaders,
      payload: {
        answers: [
          { questionId: 11, selectedOptionIds: [101] },
          { questionId: 12, selectedOptionIds: [103, 104] },
        ],
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${attemptId}/result`,
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      attempt: { id: number; score: number | null };
      test: { id: number };
      questions: Array<{ id: number; options: Array<{ id: number; isCorrect?: boolean }> }>;
      answers: Array<{
        questionId: number;
        selectedOptionIds: number[];
        isCorrect: boolean | null;
      }>;
      answersRevealed: boolean;
    };
    expect(body).toMatchObject({
      attempt: { id: attemptId, score: 1 },
      test: { id: 1 },
      answersRevealed: true,
    });
    expect(body.questions.map((question) => question.id)).toEqual([11, 12, 15]);
    expect(body.answers).toEqual([
      { questionId: 11, selectedOptionIds: [101], textAnswer: null, isCorrect: true },
      { questionId: 12, selectedOptionIds: [103, 104], textAnswer: null, isCorrect: true },
      { questionId: 15, selectedOptionIds: [], textAnswer: null, isCorrect: null },
    ]);
    expect(body.questions.find((question) => question.id === 11)?.options).toContainEqual(
      expect.objectContaining({ id: 101, isCorrect: true }),
    );
  });

  it('redacts results and submits for takers on hidden tests', async () => {
    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/tests/4/attempts',
      headers: authHeaders,
    });
    const attemptId = (started.json() as { attempt: { id: number } }).attempt.id;

    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/attempts/${attemptId}/submit`,
      headers: authHeaders,
      payload: { answers: [{ questionId: 14, selectedOptionIds: [108] }] },
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json()).toMatchObject({
      attempt: { score: null },
      answersRevealed: false,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${attemptId}/result`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      attempt: { id: attemptId, score: null },
      answersRevealed: false,
      answers: [{ questionId: 14, selectedOptionIds: [108], isCorrect: null }],
    });
    expect(JSON.stringify((response.json() as { questions: unknown }).questions)).not.toContain(
      'isCorrect',
    );
    // The stored attempt keeps its real score despite the redacted response.
    expect(state.attempts.find((attempt) => attempt.id === attemptId)?.score).toBe(1);
  });

  it('reveals hidden-test results to the author', async () => {
    currentUser.sub = '10';
    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/tests/4/attempts',
      headers: authHeaders,
    });
    const attemptId = (started.json() as { attempt: { id: number } }).attempt.id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/attempts/${attemptId}/submit`,
      headers: authHeaders,
      payload: { answers: [{ questionId: 14, selectedOptionIds: [108] }] },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${attemptId}/result`,
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      attempt: { id: attemptId, score: 1 },
      answersRevealed: true,
      answers: [{ questionId: 14, isCorrect: true }],
    });
  });

  it('rejects result reads for in-progress, missing, or foreign attempts', async () => {
    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/tests/1/attempts',
      headers: authHeaders,
    });
    const attemptId = (started.json() as { attempt: { id: number } }).attempt.id;

    const active = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${attemptId}/result`,
      headers: authHeaders,
    });
    expect(active.statusCode).toBe(409);

    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/attempts/999/result',
      headers: authHeaders,
    });
    expect(missing.statusCode).toBe(404);

    currentUser.sub = '8';
    const foreign = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${attemptId}/result`,
      headers: authHeaders,
    });
    expect(foreign.statusCode).toBe(403);
  });

  it('scopes attempt history to managers versus takers', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/tests/1/attempts',
      headers: authHeaders,
    });
    const firstId = (first.json() as { attempt: { id: number } }).attempt.id;

    currentUser.sub = '8';
    await app.inject({
      method: 'POST',
      url: '/api/v1/tests/1/attempts',
      headers: authHeaders,
    });

    currentUser.sub = '10';
    const managed = await app.inject({
      method: 'GET',
      url: '/api/v1/tests/1/attempts',
      headers: authHeaders,
    });
    expect(managed.statusCode).toBe(200);
    const all = managed.json() as Array<{
      id: number;
      userId: number;
      username: string;
      status: string;
      score: number | null;
      answersRevealed: boolean;
    }>;
    expect(all).toHaveLength(2);
    expect(all.map((item) => item.id)).toEqual([firstId + 1, firstId]);
    expect(all).toContainEqual(expect.objectContaining({ userId: 7, username: 'taker-seven' }));
    expect(all).toContainEqual(expect.objectContaining({ userId: 8, username: 'other-user' }));
    expect(all.every((item) => item.answersRevealed === true)).toBe(true);

    currentUser.sub = '7';
    const own = await app.inject({
      method: 'GET',
      url: '/api/v1/tests/1/attempts',
      headers: authHeaders,
    });
    expect(own.statusCode).toBe(200);
    expect(own.json()).toEqual([
      expect.objectContaining({
        id: firstId,
        userId: 7,
        username: 'taker-seven',
        score: null,
        answersRevealed: true,
      }),
    ]);

    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/tests/99/attempts',
      headers: authHeaders,
    });
    expect(missing.statusCode).toBe(404);
  });

  it('redacts history scores for takers on hidden tests but not managers', async () => {
    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/tests/4/attempts',
      headers: authHeaders,
    });
    const attemptId = (started.json() as { attempt: { id: number } }).attempt.id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/attempts/${attemptId}/submit`,
      headers: authHeaders,
      payload: { answers: [{ questionId: 14, selectedOptionIds: [108] }] },
    });

    const taker = await app.inject({
      method: 'GET',
      url: '/api/v1/tests/4/attempts',
      headers: authHeaders,
    });
    expect(taker.statusCode).toBe(200);
    expect(taker.json()).toEqual([
      expect.objectContaining({ id: attemptId, score: null, answersRevealed: false }),
    ]);
    // The stored attempt keeps its real score despite the redacted response.
    expect(state.attempts.find((attempt) => attempt.id === attemptId)?.score).toBe(1);

    currentUser.sub = '10';
    const managed = await app.inject({
      method: 'GET',
      url: '/api/v1/tests/4/attempts',
      headers: authHeaders,
    });
    expect(managed.statusCode).toBe(200);
    expect(managed.json()).toEqual([
      expect.objectContaining({ id: attemptId, score: 1, answersRevealed: true }),
    ]);
  });

  it('returns expired submits on hidden tests filtered', async () => {
    const hidden = state.tests.find((test) => test.id === 4);
    hidden!.timeLimitMinutes = 60;
    try {
      const started = await app.inject({
        method: 'POST',
        url: '/api/v1/tests/4/attempts',
        headers: authHeaders,
      });
      const attemptId = (started.json() as { attempt: { id: number } }).attempt.id;
      const stored = state.attempts.find((attempt) => attempt.id === attemptId);
      stored!.startedAt = new Date(Date.now() - 61 * 60_000);

      const submitted = await app.inject({
        method: 'POST',
        url: `/api/v1/attempts/${attemptId}/submit`,
        headers: authHeaders,
        payload: { answers: [{ questionId: 14, selectedOptionIds: [108] }] },
      });

      expect(submitted.statusCode).toBe(410);
      expect(submitted.json()).toMatchObject({
        error: 'EXPIRED',
        attempt: { id: attemptId, status: 'expired', score: null },
        answersRevealed: false,
        answers: [{ questionId: 14, isCorrect: null }],
      });
    } finally {
      hidden!.timeLimitMinutes = null;
    }
  });

  it('requires authentication for the grading endpoints', async () => {
    const view = await app.inject({ method: 'GET', url: '/api/v1/attempts/1/grades' });
    const grade = await app.inject({
      method: 'PATCH',
      url: '/api/v1/attempts/1/grades',
      payload: { grades: [{ questionId: 15, isCorrect: true }] },
    });

    expect(view.statusCode).toBe(401);
    expect(grade.statusCode).toBe(401);
  });

  // Starts an attempt as the taker with an open-ended answer, submits it, and
  // returns the finished attempt id.
  async function finishedAttemptWithOpenEnded() {
    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/tests/1/attempts',
      headers: authHeaders,
    });
    const attemptId = (started.json() as { attempt: { id: number } }).attempt.id;
    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/attempts/${attemptId}/submit`,
      headers: authHeaders,
      payload: {
        answers: [
          { questionId: 11, selectedOptionIds: [101] },
          { questionId: 12, selectedOptionIds: [103, 104] },
          { questionId: 15, textAnswer: 'Because.' },
        ],
      },
    });
    expect(submitted.statusCode).toBe(200);
    return attemptId;
  }

  it('lets the author grade open-ended answers and nobody else', async () => {
    const attemptId = await finishedAttemptWithOpenEnded();

    // The taker (even the attempt owner) is not a manager.
    const takerGrade = await app.inject({
      method: 'PATCH',
      url: `/api/v1/attempts/${attemptId}/grades`,
      headers: authHeaders,
      payload: { grades: [{ questionId: 15, isCorrect: true }] },
    });
    expect(takerGrade.statusCode).toBe(403);
    expect(takerGrade.json()).toMatchObject({ error: 'FORBIDDEN' });

    const takerView = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${attemptId}/grades`,
      headers: authHeaders,
    });
    expect(takerView.statusCode).toBe(403);

    currentUser.sub = '10';
    const view = await app.inject({
      method: 'GET',
      url: `/api/v1/attempts/${attemptId}/grades`,
      headers: authHeaders,
    });
    expect(view.statusCode).toBe(200);
    expect(view.json()).toMatchObject({ answersRevealed: true });

    const graded = await app.inject({
      method: 'PATCH',
      url: `/api/v1/attempts/${attemptId}/grades`,
      headers: authHeaders,
      payload: { grades: [{ questionId: 15, isCorrect: true }] },
    });
    expect(graded.statusCode).toBe(200);
    // Single 1 + multiple 1 + open-ended 1, averaged over 3 questions.
    expect(graded.json()).toMatchObject({ attempt: { id: attemptId, score: 1 } });
    expect(
      state.answerRecords.find(
        (record) => record.attemptId === attemptId && record.questionId === 15,
      )?.isCorrect,
    ).toBe(true);
  });

  it('rejects grading for missing attempts, unfinished attempts, and bad payloads', async () => {
    currentUser.sub = '10';

    const missing = await app.inject({
      method: 'PATCH',
      url: '/api/v1/attempts/999/grades',
      headers: authHeaders,
      payload: { grades: [{ questionId: 15, isCorrect: true }] },
    });
    expect(missing.statusCode).toBe(404);

    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/tests/1/attempts',
      headers: authHeaders,
    });
    const activeId = (started.json() as { attempt: { id: number } }).attempt.id;
    const active = await app.inject({
      method: 'PATCH',
      url: `/api/v1/attempts/${activeId}/grades`,
      headers: authHeaders,
      payload: { grades: [{ questionId: 15, isCorrect: true }] },
    });
    expect(active.statusCode).toBe(409);

    const attemptId = await finishedAttemptWithOpenEnded();

    for (const payload of [
      { grades: [] },
      {
        grades: [
          { questionId: 15, isCorrect: true },
          { questionId: 15, isCorrect: false },
        ],
      },
      { grades: [{ questionId: 15, isCorrect: 'yes' }] },
    ]) {
      const rejected = await app.inject({
        method: 'PATCH',
        url: `/api/v1/attempts/${attemptId}/grades`,
        headers: authHeaders,
        payload,
      });
      expect(rejected.statusCode).toBe(400);
      expect(rejected.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
    }

    // Choice questions are graded automatically and cannot be graded manually.
    const choice = await app.inject({
      method: 'PATCH',
      url: `/api/v1/attempts/${attemptId}/grades`,
      headers: authHeaders,
      payload: { grades: [{ questionId: 11, isCorrect: true }] },
    });
    expect(choice.statusCode).toBe(400);
    expect(choice.json()).toMatchObject({ error: 'VALIDATION_ERROR' });

    const foreign = await app.inject({
      method: 'PATCH',
      url: `/api/v1/attempts/${attemptId}/grades`,
      headers: authHeaders,
      payload: { grades: [{ questionId: 999, isCorrect: true }] },
    });
    expect(foreign.statusCode).toBe(400);
    expect(foreign.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
  });

  it('answers 403 with the used budget once the attempt limit is reached', async () => {
    const published = state.tests.find((test) => test.id === 1);
    const previousMax = published!.maxAttempts ?? null;
    try {
      published!.maxAttempts = 3;
      for (let used = 0; used < 3; used += 1) {
        const started = await app.inject({
          method: 'POST',
          url: '/api/v1/tests/1/attempts',
          headers: authHeaders,
        });
        expect(started.statusCode).toBe(201);
        const attemptId = (started.json() as { attempt: { id: number } }).attempt.id;
        const submitted = await app.inject({
          method: 'POST',
          url: `/api/v1/attempts/${attemptId}/submit`,
          headers: authHeaders,
          payload: { answers: [{ questionId: 11, selectedOptionIds: [101] }] },
        });
        expect(submitted.statusCode).toBe(200);
      }

      const blocked = await app.inject({
        method: 'POST',
        url: '/api/v1/tests/1/attempts',
        headers: authHeaders,
      });
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json()).toMatchObject({
        error: 'ATTEMPT_LIMIT',
        message: 'Attempt limit reached (3 of 3 used)',
      });
      expect(state.attempts).toHaveLength(3);
    } finally {
      published!.maxAttempts = previousMax;
    }
  });

  it('enforces the availability window on start and submit', async () => {
    const published = state.tests.find((test) => test.id === 1);
    const previousFrom = published!.availableFrom;
    const previousUntil = published!.availableUntil;
    try {
      published!.availableFrom = new Date(Date.now() + 60_000);
      published!.availableUntil = null;
      const early = await app.inject({
        method: 'POST',
        url: '/api/v1/tests/1/attempts',
        headers: authHeaders,
      });
      expect(early.statusCode).toBe(403);
      expect(early.json()).toMatchObject({ error: 'TEST_NOT_OPEN' });

      published!.availableFrom = null;
      published!.availableUntil = new Date(Date.now() - 60_000);
      const late = await app.inject({
        method: 'POST',
        url: '/api/v1/tests/1/attempts',
        headers: authHeaders,
      });
      expect(late.statusCode).toBe(403);
      expect(late.json()).toMatchObject({ error: 'TEST_CLOSED' });

      // An in-progress attempt past the close force-expires on resume...
      published!.availableFrom = null;
      published!.availableUntil = new Date(Date.now() + 60_000);
      const started = await app.inject({
        method: 'POST',
        url: '/api/v1/tests/1/attempts',
        headers: authHeaders,
      });
      const attemptId = (started.json() as { attempt: { id: number } }).attempt.id;
      published!.availableUntil = new Date(Date.now() - 1_000);
      const resumed = await app.inject({
        method: 'POST',
        url: '/api/v1/tests/1/attempts',
        headers: authHeaders,
      });
      expect(resumed.statusCode).toBe(403);
      expect(resumed.json()).toMatchObject({ error: 'TEST_CLOSED' });
      expect(state.attempts.find((attempt) => attempt.id === attemptId)?.status).toBe('expired');

      // ...and a late submit grades as expired with a 410 result.
      published!.availableUntil = new Date(Date.now() + 60_000);
      const fresh = await app.inject({
        method: 'POST',
        url: '/api/v1/tests/1/attempts',
        headers: authHeaders,
      });
      const freshId = (fresh.json() as { attempt: { id: number } }).attempt.id;
      published!.availableUntil = new Date(Date.now() - 1_000);
      const submitted = await app.inject({
        method: 'POST',
        url: `/api/v1/attempts/${freshId}/submit`,
        headers: authHeaders,
        payload: { answers: [{ questionId: 11, selectedOptionIds: [101] }] },
      });
      expect(submitted.statusCode).toBe(410);
      expect(submitted.json()).toMatchObject({
        error: 'EXPIRED',
        attempt: { id: freshId, status: 'expired' },
      });
    } finally {
      published!.availableFrom = previousFrom;
      published!.availableUntil = previousUntil;
    }
  });
});
