import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SubmitAttemptResult } from '@testopia/shared';

import { AttemptsService } from './service.js';

const publishedTest = {
  id: 1,
  title: 'Basics',
  description: null,
  authorId: 10,
  isPublished: true,
  shuffleQuestions: false,
  timeLimitMinutes: null,
  showAnswersAfterCompletion: true,
  showQuestionsBeforeStart: true,
  availableFrom: null,
  availableUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const questions = [
  {
    id: 11,
    testId: 1,
    text: 'Single',
    type: 'single_choice' as const,
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
    type: 'multiple_choice' as const,
    orderIndex: 1,
    options: [
      { id: 103, questionId: 12, text: 'A', isCorrect: true },
      { id: 104, questionId: 12, text: 'B', isCorrect: true },
      { id: 105, questionId: 12, text: 'C', isCorrect: false },
    ],
  },
  {
    id: 13,
    testId: 1,
    text: 'Boolean',
    type: 'true_false' as const,
    orderIndex: 2,
    options: [
      { id: 106, questionId: 13, text: 'True', isCorrect: true },
      { id: 107, questionId: 13, text: 'False', isCorrect: false },
    ],
  },
  {
    id: 14,
    testId: 1,
    text: 'Explain',
    type: 'open_ended' as const,
    orderIndex: 3,
    options: [],
  },
];

const inProgressAttempt = {
  id: 5,
  userId: 7,
  testId: 1,
  status: 'in_progress' as const,
  startedAt: new Date(),
  completedAt: null,
  score: null,
  timeSpentSeconds: null,
  questionOrder: [11, 12, 13, 14],
};

function setup(
  overrides: { tests?: Record<string, unknown>; attempts?: Record<string, unknown> } = {},
) {
  const tests = {
    findById: vi.fn().mockResolvedValue(publishedTest),
    findQuestions: vi.fn().mockResolvedValue(questions),
    ...overrides.tests,
  };
  const attempts = {
    findActiveAttempt: vi.fn().mockResolvedValue(null),
    findAttemptById: vi.fn().mockResolvedValue(inProgressAttempt),
    findAnswerRecords: vi.fn().mockResolvedValue([]),
    listAttemptsByTest: vi.fn().mockResolvedValue([]),
    createAttempt: vi
      .fn()
      .mockImplementation(
        async (input: { userId: number; testId: number; questionOrder: number[] | null }) => ({
          ...inProgressAttempt,
          id: 6,
          userId: input.userId,
          testId: input.testId,
          questionOrder: input.questionOrder,
        }),
      ),
    completeAttempt: vi
      .fn()
      .mockImplementation(
        async (id: number, outcome: { status: 'completed' | 'expired'; score: number | null }) => ({
          ...inProgressAttempt,
          id,
          ...outcome,
          completedAt: new Date(),
        }),
      ),
    ...overrides.attempts,
  };
  return { tests, attempts, service: new AttemptsService(tests as never, attempts as never) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AttemptsService', () => {
  it('blocks starting unpublished or missing tests', async () => {
    const missing = setup({ tests: { findById: vi.fn().mockResolvedValue(null) } });
    await expect(missing.service.start({ id: 7, role: 'user' }, 99)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const draft = setup({
      tests: { findById: vi.fn().mockResolvedValue({ ...publishedTest, isPublished: false }) },
    });
    await expect(draft.service.start({ id: 7, role: 'user' }, 1)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('resumes the active attempt instead of creating a new one', async () => {
    const { service, attempts } = setup({
      attempts: { findActiveAttempt: vi.fn().mockResolvedValue(inProgressAttempt) },
    });

    const detail = await service.start({ id: 7, role: 'user' }, 1);

    expect(detail.attempt.id).toBe(5);
    expect(attempts.createAttempt).not.toHaveBeenCalled();
  });

  it('persists shuffled order only when the test shuffles questions', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const shuffled = setup({
      tests: {
        findById: vi.fn().mockResolvedValue({ ...publishedTest, shuffleQuestions: true }),
        findQuestions: vi.fn().mockResolvedValue(questions),
      },
    });
    await shuffled.service.start({ id: 7, role: 'user' }, 1);
    expect(shuffled.attempts.createAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ questionOrder: [12, 13, 14, 11] }),
    );

    const natural = setup();
    await natural.service.start({ id: 7, role: 'user' }, 1);
    expect(natural.attempts.createAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ questionOrder: [11, 12, 13, 14] }),
    );
  });

  it('returns questions in persisted order with answers redacted', async () => {
    const { service } = setup({
      attempts: {
        findAttemptById: vi
          .fn()
          .mockResolvedValue({ ...inProgressAttempt, questionOrder: [14, 11] }),
      },
    });

    const detail = await service.get(5, { id: 7, role: 'user' });

    expect(detail.test).toMatchObject({ id: 1, title: 'Basics', timeLimitMinutes: null });
    expect(detail.questions.map((question) => question.id)).toEqual([14, 11, 12, 13]);
    const choice = detail.questions.find((question) => question.id === 11);
    expect(choice?.options[0]).not.toHaveProperty('isCorrect');
  });

  it('restricts attempt reads to the owner and admins', async () => {
    const { service } = setup();
    await expect(service.get(5, { id: 8, role: 'user' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(service.get(5, { id: 99, role: 'admin' })).resolves.toMatchObject({
      attempt: { id: 5 },
    });
  });

  it('scores every question type deterministically', async () => {
    const { service, attempts } = setup();

    const result = await service.submit({ id: 7, role: 'user' } as never, 5, {
      answers: [
        { questionId: 11, selectedOptionIds: [101], textAnswer: null },
        { questionId: 12, selectedOptionIds: [103, 104], textAnswer: null },
        { questionId: 13, selectedOptionIds: [106], textAnswer: null },
        { questionId: 14, selectedOptionIds: [], textAnswer: 'Because.' },
      ],
    } as never);

    expect(result.attempt.score).toBe(1);
    expect(result.answers).toEqual([
      { questionId: 11, selectedOptionIds: [101], textAnswer: null, isCorrect: true },
      { questionId: 12, selectedOptionIds: [103, 104], textAnswer: null, isCorrect: true },
      { questionId: 13, selectedOptionIds: [106], textAnswer: null, isCorrect: true },
      { questionId: 14, selectedOptionIds: [], textAnswer: 'Because.', isCorrect: null },
    ]);
    const [, outcome, records] = attempts.completeAttempt.mock.calls[0] as [
      number,
      { status: string; score: number | null },
      Array<{ questionId: number; selectedOptionId: number | null }>,
    ];
    expect(outcome).toMatchObject({ status: 'completed', score: 1 });
    // Multiple-choice stores one row per selected option id.
    expect(
      records.filter((record) => record.questionId === 12).map((r) => r.selectedOptionId),
    ).toEqual([103, 104]);
  });

  it('marks partial and invalid selections incorrect without touching open-ended scoring', async () => {
    const { service } = setup();

    const result = await service.submit({ id: 7, role: 'user' } as never, 5, {
      answers: [
        { questionId: 11, selectedOptionIds: [101, 102], textAnswer: null },
        { questionId: 12, selectedOptionIds: [103], textAnswer: null },
        { questionId: 13, selectedOptionIds: [107], textAnswer: null },
      ],
    } as never);

    expect(result.attempt.score).toBe(0);
    expect(result.answers.map((answer) => answer.isCorrect)).toEqual([false, false, false, null]);
  });

  it('leaves score null when a test has only open-ended questions', async () => {
    const openOnly = [questions[3]!];
    const { service } = setup({
      tests: { findQuestions: vi.fn().mockResolvedValue(openOnly) },
    });

    const result = await service.submit({ id: 7, role: 'user' } as never, 5, {
      answers: [{ questionId: 14, selectedOptionIds: [], textAnswer: 'Essay' }],
    } as never);

    expect(result.attempt.score).toBeNull();
  });

  it('rejects duplicate submits and foreign questions or options', async () => {
    const finished = setup({
      attempts: {
        findAttemptById: vi.fn().mockResolvedValue({ ...inProgressAttempt, status: 'completed' }),
      },
    });
    await expect(
      finished.service.submit({ id: 7, role: 'user' } as never, 5, { answers: [] } as never),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const { service } = setup();
    await expect(
      service.submit({ id: 7, role: 'user' } as never, 5, {
        answers: [{ questionId: 999, selectedOptionIds: [], textAnswer: null }],
      } as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      service.submit({ id: 7, role: 'user' } as never, 5, {
        answers: [{ questionId: 11, selectedOptionIds: [103], textAnswer: null }],
      } as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('reports a conflict when a concurrent submit wins the completion race', async () => {
    const { service } = setup({
      attempts: { completeAttempt: vi.fn().mockResolvedValue(null) },
    });

    await expect(
      service.submit({ id: 7, role: 'user' } as never, 5, {
        answers: [{ questionId: 11, selectedOptionIds: [101], textAnswer: null }],
      } as never),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('expires late submits using the server clock and persists the result', async () => {
    const startedAt = new Date(Date.now() - 61 * 60_000);
    const { service, attempts } = setup({
      tests: {
        findById: vi.fn().mockResolvedValue({ ...publishedTest, timeLimitMinutes: 60 }),
      },
      attempts: {
        findAttemptById: vi.fn().mockResolvedValue({ ...inProgressAttempt, startedAt }),
      },
    });

    const failure = await service
      .submit({ id: 7, role: 'user' } as never, 5, { answers: [] } as never)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ name: 'AttemptError', code: 'EXPIRED' });
    expect(attempts.completeAttempt).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ status: 'expired' }),
      expect.any(Array),
    );
  });

  describe('availability window', () => {
    it('blocks fresh starts before opening', async () => {
      const { service, attempts } = setup({
        tests: {
          findById: vi
            .fn()
            .mockResolvedValue({ ...publishedTest, availableFrom: new Date(Date.now() + 60_000) }),
        },
      });

      await expect(service.start({ id: 7, role: 'user' }, 1)).rejects.toMatchObject({
        code: 'TEST_NOT_OPEN',
      });
      expect(attempts.createAttempt).not.toHaveBeenCalled();
    });

    it('blocks fresh starts after closing', async () => {
      const { service, attempts } = setup({
        tests: {
          findById: vi
            .fn()
            .mockResolvedValue({ ...publishedTest, availableUntil: new Date(Date.now() - 60_000) }),
        },
      });

      await expect(service.start({ id: 7, role: 'user' }, 1)).rejects.toMatchObject({
        code: 'TEST_CLOSED',
      });
      expect(attempts.createAttempt).not.toHaveBeenCalled();
    });

    it('resumes the active attempt inside an open window', async () => {
      const { service, attempts } = setup({
        tests: {
          findById: vi.fn().mockResolvedValue({
            ...publishedTest,
            availableFrom: new Date(Date.now() - 60_000),
            availableUntil: new Date(Date.now() + 60_000),
          }),
        },
        attempts: { findActiveAttempt: vi.fn().mockResolvedValue(inProgressAttempt) },
      });

      const detail = await service.start({ id: 7, role: 'user' }, 1);

      expect(detail.attempt.id).toBe(5);
      expect(attempts.createAttempt).not.toHaveBeenCalled();
    });

    it('force-expires the active attempt on start past the close', async () => {
      const { service, attempts } = setup({
        tests: {
          findById: vi
            .fn()
            .mockResolvedValue({ ...publishedTest, availableUntil: new Date(Date.now() - 1_000) }),
        },
        attempts: { findActiveAttempt: vi.fn().mockResolvedValue(inProgressAttempt) },
      });

      await expect(service.start({ id: 7, role: 'user' }, 1)).rejects.toMatchObject({
        code: 'TEST_CLOSED',
      });
      expect(attempts.completeAttempt).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ status: 'expired', score: null }),
        [],
      );
      expect(attempts.createAttempt).not.toHaveBeenCalled();
    });

    it('grades submit past the close as expired', async () => {
      const { service, attempts } = setup({
        tests: {
          findById: vi
            .fn()
            .mockResolvedValue({ ...publishedTest, availableUntil: new Date(Date.now() - 1_000) }),
        },
      });

      const failure = await service
        .submit({ id: 7, role: 'user' } as never, 5, {
          answers: [
            { questionId: 11, selectedOptionIds: [101], textAnswer: null },
            { questionId: 12, selectedOptionIds: [103, 104], textAnswer: null },
            { questionId: 13, selectedOptionIds: [106], textAnswer: null },
            { questionId: 14, selectedOptionIds: [], textAnswer: 'Because.' },
          ],
        } as never)
        .catch((error: unknown) => error);

      expect(failure).toMatchObject({ name: 'AttemptError', code: 'EXPIRED' });
      const [, outcome] = attempts.completeAttempt.mock.calls[0] as [
        number,
        { status: string; score: number | null },
      ];
      expect(outcome).toMatchObject({ status: 'expired', score: 1 });
    });
  });

  describe('results and answer visibility', () => {
    const completedAttempt = {
      ...inProgressAttempt,
      status: 'completed' as const,
      score: 1,
      timeSpentSeconds: 60,
      completedAt: new Date(),
    };
    const storedRecords = [
      {
        id: 1,
        attemptId: 5,
        questionId: 11,
        selectedOptionId: 101,
        textAnswer: null,
        isCorrect: true,
      },
      {
        id: 2,
        attemptId: 5,
        questionId: 12,
        selectedOptionId: 103,
        textAnswer: null,
        isCorrect: true,
      },
      {
        id: 3,
        attemptId: 5,
        questionId: 12,
        selectedOptionId: 104,
        textAnswer: null,
        isCorrect: true,
      },
      {
        id: 4,
        attemptId: 5,
        questionId: 13,
        selectedOptionId: 107,
        textAnswer: null,
        isCorrect: false,
      },
      {
        id: 5,
        attemptId: 5,
        questionId: 14,
        selectedOptionId: null,
        textAnswer: 'Because.',
        isCorrect: null,
      },
    ];
    const hiddenTest = { ...publishedTest, showAnswersAfterCompletion: false };

    function resultSetup(
      testRow: typeof publishedTest = publishedTest,
      attemptRow: typeof completedAttempt | typeof inProgressAttempt = completedAttempt,
    ) {
      return setup({
        tests: {
          findById: vi.fn().mockResolvedValue(testRow),
          findQuestions: vi.fn().mockResolvedValue(questions),
        },
        attempts: {
          findAttemptById: vi.fn().mockResolvedValue(attemptRow),
          findAnswerRecords: vi.fn().mockResolvedValue(storedRecords),
        },
      });
    }

    it('reveals full results to takers when the test shows answers', async () => {
      const { service } = resultSetup();

      const result = await service.getResult(5, { id: 7, role: 'user' });

      expect(result.answersRevealed).toBe(true);
      expect(result.attempt.score).toBe(1);
      expect(result.test).toMatchObject({ id: 1, title: 'Basics' });
      expect(result.questions.map((question) => question.id)).toEqual([11, 12, 13, 14]);
      expect(result.answers).toEqual([
        { questionId: 11, selectedOptionIds: [101], textAnswer: null, isCorrect: true },
        { questionId: 12, selectedOptionIds: [103, 104], textAnswer: null, isCorrect: true },
        { questionId: 13, selectedOptionIds: [107], textAnswer: null, isCorrect: false },
        { questionId: 14, selectedOptionIds: [], textAnswer: 'Because.', isCorrect: null },
      ]);
      const single = result.questions.find((question) => question.id === 11);
      expect(single?.options).toContainEqual(expect.objectContaining({ id: 101, isCorrect: true }));
    });

    it('redacts results for takers when the author hides answers', async () => {
      const { service } = resultSetup(hiddenTest);

      const result = await service.getResult(5, { id: 7, role: 'user' });

      expect(result.answersRevealed).toBe(false);
      expect(result.attempt.score).toBeNull();
      expect(result.answers.map((answer) => answer.isCorrect)).toEqual([null, null, null, null]);
      // Selections and text answers stay visible; only verdicts are hidden.
      expect(result.answers).toMatchObject([
        { questionId: 11, selectedOptionIds: [101] },
        { questionId: 12, selectedOptionIds: [103, 104] },
        { questionId: 13, selectedOptionIds: [107] },
        { questionId: 14, textAnswer: 'Because.' },
      ]);
      expect(JSON.stringify(result.questions)).not.toContain('isCorrect');
      // Redaction never mutates the persisted row.
      expect(completedAttempt.score).toBe(1);
    });

    it('reveals hidden-test results to the author and admins', async () => {
      const authorOwns = resultSetup(hiddenTest, { ...completedAttempt, userId: 10 });
      const authorResult = await authorOwns.service.getResult(5, { id: 10, role: 'user' });
      expect(authorResult.answersRevealed).toBe(true);
      expect(authorResult.attempt.score).toBe(1);

      const { service } = resultSetup(hiddenTest);
      const adminResult = await service.getResult(5, { id: 99, role: 'admin' });
      expect(adminResult.answersRevealed).toBe(true);
      expect(adminResult.attempt.score).toBe(1);
      expect(adminResult.answers.find((answer) => answer.questionId === 13)).toMatchObject({
        isCorrect: false,
      });
    });

    it('rejects result reads for in-progress, missing, or foreign attempts', async () => {
      const active = resultSetup(publishedTest, inProgressAttempt);
      await expect(active.service.getResult(5, { id: 7, role: 'user' })).rejects.toMatchObject({
        code: 'CONFLICT',
      });

      const missing = setup({ attempts: { findAttemptById: vi.fn().mockResolvedValue(null) } });
      await expect(missing.service.getResult(99, { id: 7, role: 'user' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });

      const { service } = resultSetup();
      await expect(service.getResult(5, { id: 8, role: 'user' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('filters submit results on hidden tests but persists the real score', async () => {
      const { service, attempts } = setup({
        tests: {
          findById: vi.fn().mockResolvedValue(hiddenTest),
          findQuestions: vi.fn().mockResolvedValue(questions),
        },
      });

      const result = await service.submit({ id: 7, role: 'user' } as never, 5, {
        answers: [
          { questionId: 11, selectedOptionIds: [101], textAnswer: null },
          { questionId: 12, selectedOptionIds: [103, 104], textAnswer: null },
          { questionId: 13, selectedOptionIds: [106], textAnswer: null },
          { questionId: 14, selectedOptionIds: [], textAnswer: 'Because.' },
        ],
      } as never);

      expect(result.answersRevealed).toBe(false);
      expect(result.attempt.score).toBeNull();
      expect(result.answers.map((answer) => answer.isCorrect)).toEqual([null, null, null, null]);
      const [, outcome] = attempts.completeAttempt.mock.calls[0] as [
        number,
        { status: string; score: number | null },
      ];
      expect(outcome).toMatchObject({ status: 'completed', score: 1 });
    });

    it('reveals hidden-test submits to the author', async () => {
      const { service } = setup({
        tests: {
          findById: vi.fn().mockResolvedValue(hiddenTest),
          findQuestions: vi.fn().mockResolvedValue(questions),
        },
        attempts: {
          findAttemptById: vi.fn().mockResolvedValue({ ...inProgressAttempt, userId: 10 }),
        },
      });

      const result = await service.submit({ id: 10, role: 'user' } as never, 5, {
        answers: [
          { questionId: 11, selectedOptionIds: [101], textAnswer: null },
          { questionId: 12, selectedOptionIds: [103, 104], textAnswer: null },
          { questionId: 13, selectedOptionIds: [106], textAnswer: null },
          { questionId: 14, selectedOptionIds: [], textAnswer: 'Because.' },
        ],
      } as never);

      expect(result.answersRevealed).toBe(true);
      expect(result.attempt.score).toBe(1);
      expect(result.answers[0]).toMatchObject({ questionId: 11, isCorrect: true });
    });

    it('filters expired submits on hidden tests', async () => {
      const startedAt = new Date(Date.now() - 61 * 60_000);
      const { service } = setup({
        tests: {
          findById: vi.fn().mockResolvedValue({ ...hiddenTest, timeLimitMinutes: 60 }),
          findQuestions: vi.fn().mockResolvedValue(questions),
        },
        attempts: {
          findAttemptById: vi.fn().mockResolvedValue({ ...inProgressAttempt, startedAt }),
        },
      });

      const failure = await service
        .submit({ id: 7, role: 'user' } as never, 5, { answers: [] } as never)
        .catch((error: unknown) => error);

      expect(failure).toMatchObject({ name: 'AttemptError', code: 'EXPIRED' });
      const details = (failure as { details: SubmitAttemptResult }).details;
      expect(details.answersRevealed).toBe(false);
      expect(details.attempt.score).toBeNull();
      expect(details.answers.map((answer) => answer.isCorrect)).toEqual([null, null, null, null]);
    });

    it('reconstructs result answers from stored rows exactly as graded at submit time', async () => {
      const submitted = setup();
      const submitResult = await submitted.service.submit({ id: 7, role: 'user' } as never, 5, {
        answers: [
          { questionId: 11, selectedOptionIds: [101], textAnswer: null },
          { questionId: 12, selectedOptionIds: [103, 104], textAnswer: null },
          { questionId: 13, selectedOptionIds: [107], textAnswer: null },
          { questionId: 14, selectedOptionIds: [], textAnswer: 'Because.' },
        ],
      } as never);
      const [, , records] = submitted.attempts.completeAttempt.mock.calls[0] as [
        number,
        unknown,
        typeof storedRecords,
      ];

      const reader = setup({
        attempts: {
          findAttemptById: vi.fn().mockResolvedValue({
            ...completedAttempt,
            score: submitResult.attempt.score,
          }),
          findAnswerRecords: vi.fn().mockResolvedValue(records),
        },
      });
      const result = await reader.service.getResult(5, { id: 7, role: 'user' });

      expect(result.answers).toEqual(submitResult.answers);
    });

    it('scopes history to managers versus takers', async () => {
      const rows = [
        { ...completedAttempt, id: 5, userId: 7, username: 'taker' },
        { ...completedAttempt, id: 6, userId: 8, username: 'other' },
      ];
      const { service, attempts, tests } = setup({
        attempts: { listAttemptsByTest: vi.fn().mockResolvedValue(rows) },
      });

      const own = await service.listHistory({ id: 7, role: 'user' }, 1);
      expect(attempts.listAttemptsByTest).toHaveBeenCalledWith(1, { userId: 7 });
      expect(own).toHaveLength(2);
      expect(own[0]).toMatchObject({ id: 5, username: 'taker', score: 1, answersRevealed: true });
      expect(own[1]).toMatchObject({ id: 6, username: 'other', score: 1, answersRevealed: true });

      const author = await service.listHistory({ id: 10, role: 'user' }, 1);
      expect(attempts.listAttemptsByTest).toHaveBeenCalledWith(1);
      expect(author.map((item) => item.username)).toEqual(['taker', 'other']);
      expect(author.every((item) => item.answersRevealed === true)).toBe(true);

      const admin = await service.listHistory({ id: 99, role: 'admin' }, 1);
      expect(attempts.listAttemptsByTest).toHaveBeenCalledWith(1);
      expect(tests.findById).toHaveBeenCalledWith(1);

      const missing = setup({ tests: { findById: vi.fn().mockResolvedValue(null) } });
      await expect(missing.service.listHistory({ id: 7, role: 'user' }, 99)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(admin).toHaveLength(2);
    });

    it('redacts history scores for takers on hidden tests but not managers', async () => {
      const rows = [
        { ...completedAttempt, id: 5, userId: 7, username: 'taker' },
        { ...completedAttempt, id: 6, userId: 8, username: 'other' },
      ];
      const hiddenSetup = () =>
        setup({
          tests: {
            findById: vi.fn().mockResolvedValue(hiddenTest),
            findQuestions: vi.fn().mockResolvedValue(questions),
          },
          attempts: { listAttemptsByTest: vi.fn().mockResolvedValue(rows) },
        });

      const taker = await hiddenSetup().service.listHistory({ id: 7, role: 'user' }, 1);
      expect(taker).toHaveLength(2);
      expect(taker[0]).toMatchObject({ id: 5, username: 'taker', score: null });
      expect(taker[0]?.answersRevealed).toBe(false);
      expect(taker[1]).toMatchObject({ id: 6, score: null, answersRevealed: false });
      // Persisted rows keep their real scores (mapping-time-only redaction).
      expect(rows[0]?.score).toBe(1);

      const author = await hiddenSetup().service.listHistory({ id: 10, role: 'user' }, 1);
      expect(author[0]).toMatchObject({ id: 5, score: 1, answersRevealed: true });

      const admin = await hiddenSetup().service.listHistory({ id: 99, role: 'admin' }, 1);
      expect(admin[0]).toMatchObject({ id: 5, score: 1, answersRevealed: true });
    });
  });
});
