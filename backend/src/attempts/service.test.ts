import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SubmitAttemptResult } from '@testopia/shared';

import { AttemptsService, isPermutation, scoreOf } from './service.js';

const publishedTest = {
  id: 1,
  title: 'Basics',
  description: null,
  authorId: 10,
  isPublished: true,
  shuffleQuestions: false,
  shuffleOptions: false,
  maxAttempts: null,
  questionCount: null,
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
};

function setup(
  overrides: { tests?: Record<string, unknown>; attempts?: Record<string, unknown> } = {},
) {
  const tests = {
    findById: vi.fn().mockResolvedValue(publishedTest),
    findQuestions: vi.fn().mockResolvedValue(questions),
    ...overrides.tests,
  };
  // Orders live in their own tables now: what start() stores is what later
  // reads serve, unless a test overrides findAttemptOrders outright.
  const storedOrders = new Map<
    number,
    { questionIds: number[] | null; optionOrders: Map<number, number[]> }
  >();
  const fullOrders = () => ({
    questionIds: [11, 12, 13, 14],
    optionOrders: new Map() as Map<number, number[]>,
  });
  const attempts = {
    findActiveAttempt: vi.fn().mockResolvedValue(null),
    findAttemptById: vi.fn().mockResolvedValue(inProgressAttempt),
    findAnswerRecords: vi.fn().mockResolvedValue([]),
    listAttemptsByTest: vi.fn().mockResolvedValue([]),
    countTerminalByUser: vi.fn().mockResolvedValue(0),
    findAttemptOrders: vi
      .fn()
      .mockImplementation(async (id: number) => storedOrders.get(id) ?? fullOrders()),
    findAttemptOrdersMany: vi
      .fn()
      .mockImplementation(async (ids: number[]) => new Map(ids.map((id) => [id, fullOrders()]))),
    createAttempt: vi
      .fn()
      .mockImplementation(
        async (input: {
          userId: number;
          testId: number;
          questionIds: number[];
          optionOrders: Record<number, number[]> | null;
        }) => {
          storedOrders.set(6, {
            questionIds: input.questionIds,
            optionOrders: new Map(
              Object.entries(input.optionOrders ?? {}).map(([key, value]) => [Number(key), value]),
            ),
          });
          return { ...inProgressAttempt, id: 6, userId: input.userId, testId: input.testId };
        },
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
    updateAnswerVerdicts: vi
      .fn()
      .mockImplementation(async (id: number, _verdicts: unknown, score: number | null) => ({
        ...inProgressAttempt,
        id,
        status: 'completed' as const,
        score,
        completedAt: new Date(),
      })),
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
    // A fixed mid draw forces a definite permutation in either shuffle
    // direction, so the assertion does not depend on the swap order.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const shuffled = setup({
      tests: {
        findById: vi.fn().mockResolvedValue({ ...publishedTest, shuffleQuestions: true }),
        findQuestions: vi.fn().mockResolvedValue(questions),
      },
    });
    await shuffled.service.start({ id: 7, role: 'user' }, 1);
    const shuffledOrder = (
      shuffled.attempts.createAttempt.mock.calls[0]![0] as { questionIds: number[] }
    ).questionIds;
    expect([...shuffledOrder].sort((a, b) => a - b)).toEqual([11, 12, 13, 14]);
    expect(shuffledOrder).not.toEqual([11, 12, 13, 14]);

    const natural = setup();
    await natural.service.start({ id: 7, role: 'user' }, 1);
    expect(natural.attempts.createAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ questionIds: [11, 12, 13, 14] }),
    );
  });

  it('refuses a fresh attempt once the taker used the whole budget', async () => {
    const limited = setup({
      tests: { findById: vi.fn().mockResolvedValue({ ...publishedTest, maxAttempts: 3 }) },
      attempts: { countTerminalByUser: vi.fn().mockResolvedValue(3) },
    });

    await expect(limited.service.start({ id: 7, role: 'user' }, 1)).rejects.toMatchObject({
      code: 'ATTEMPT_LIMIT',
      message: 'Attempt limit reached (3 of 3 used)',
    });
    expect(limited.attempts.createAttempt).not.toHaveBeenCalled();
  });

  it('allows the attempt below the limit and skips the check when unlimited', async () => {
    const belowLimit = setup({
      tests: { findById: vi.fn().mockResolvedValue({ ...publishedTest, maxAttempts: 3 }) },
      attempts: { countTerminalByUser: vi.fn().mockResolvedValue(2) },
    });
    await belowLimit.service.start({ id: 7, role: 'user' }, 1);
    expect(belowLimit.attempts.createAttempt).toHaveBeenCalledOnce();

    // An in-progress attempt resumes through findActiveAttempt, so the budget
    // check must not run (and block) for it.
    const resumed = setup({
      tests: { findById: vi.fn().mockResolvedValue({ ...publishedTest, maxAttempts: 1 }) },
      attempts: {
        findActiveAttempt: vi.fn().mockResolvedValue(inProgressAttempt),
        countTerminalByUser: vi.fn().mockResolvedValue(1),
      },
    });
    const detail = await resumed.service.start({ id: 7, role: 'user' }, 1);
    expect(detail.attempt.id).toBe(5);
    expect(resumed.attempts.countTerminalByUser).not.toHaveBeenCalled();

    const unlimited = setup();
    await unlimited.service.start({ id: 7, role: 'user' }, 1);
    expect(unlimited.attempts.countTerminalByUser).not.toHaveBeenCalled();
  });

  it('persists a per-attempt option order only when the test shuffles options', async () => {
    const shuffled = setup({
      tests: {
        findById: vi.fn().mockResolvedValue({ ...publishedTest, shuffleOptions: true }),
      },
    });
    await shuffled.service.start({ id: 7, role: 'user' }, 1);

    const created = shuffled.attempts.createAttempt.mock.calls[0]![0] as {
      optionOrders: Record<number, number[]>;
    };
    // Every option of every question appears exactly once, whatever the shuffle.
    expect(
      Object.keys(created.optionOrders)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([11, 12, 13, 14]);
    expect([...created.optionOrders[11]!].sort((a, b) => a - b)).toEqual([101, 102]);
    expect([...created.optionOrders[12]!].sort((a, b) => a - b)).toEqual([103, 104, 105]);
    expect(created.optionOrders[14]).toEqual([]);

    const natural = setup();
    await natural.service.start({ id: 7, role: 'user' }, 1);
    expect(natural.attempts.createAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ optionOrders: null }),
    );
  });

  it('stores option orders only for the sampled questions', async () => {
    const sampled = setup({
      tests: {
        findById: vi.fn().mockResolvedValue({
          ...publishedTest,
          shuffleOptions: true,
          questionCount: 2,
        }),
      },
    });
    await sampled.service.start({ id: 7, role: 'user' }, 1);

    const created = sampled.attempts.createAttempt.mock.calls[0]![0] as {
      questionIds: number[];
      optionOrders: Record<number, number[]>;
    };
    expect(created.questionIds).toHaveLength(2);
    // Sampled-out questions get no rows: the key set is exactly the asked set.
    expect(
      Object.keys(created.optionOrders)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([...created.questionIds].sort((a, b) => a - b));
  });

  it('renders shuffled options and falls back when the stored order no longer fits', async () => {
    const shuffled = setup({
      attempts: {
        findAttemptOrders: vi.fn().mockResolvedValue({
          questionIds: [11, 12, 13, 14],
          optionOrders: new Map([
            [11, [102, 101]],
            [12, [105, 103, 104]],
          ]),
        }),
      },
    });

    const detail = await shuffled.service.get(5, { id: 7, role: 'user' });
    const byId = new Map(detail.questions.map((question) => [question.id, question]));
    expect(byId.get(11)?.options.map((option) => option.id)).toEqual([102, 101]);
    expect(byId.get(12)?.options.map((option) => option.id)).toEqual([105, 103, 104]);
    // Questions with no stored entry keep their natural option order.
    expect(byId.get(13)?.options.map((option) => option.id)).toEqual([106, 107]);

    // An author added an option mid-attempt: the stale order is discarded
    // rather than dropping or duplicating a choice.
    const edited = setup({
      tests: {
        findQuestions: vi.fn().mockResolvedValue([
          {
            ...questions[0]!,
            options: [
              ...questions[0]!.options,
              { id: 108, questionId: 11, text: 'C', isCorrect: false },
            ],
          },
          ...questions.slice(1),
        ]),
      },
      attempts: {
        findAttemptOrders: vi.fn().mockResolvedValue({
          questionIds: [11, 12, 13, 14],
          optionOrders: new Map([[11, [102, 101]]]),
        }),
      },
    });
    const editedDetail = await edited.service.get(5, { id: 7, role: 'user' });
    const editedQuestion = editedDetail.questions.find((question) => question.id === 11);
    expect(editedQuestion?.options.map((option) => option.id)).toEqual([101, 102, 108]);
  });

  it('detects whether a stored order is a permutation of the current options', () => {
    expect(isPermutation([2, 1], [1, 2])).toBe(true);
    expect(isPermutation([1, 1], [1, 2])).toBe(false);
    expect(isPermutation([1], [1, 2])).toBe(false);
    expect(isPermutation([1, 3], [1, 2])).toBe(false);
    expect(isPermutation([], [])).toBe(true);
  });

  it('returns questions in persisted order with answers redacted', async () => {
    const { service } = setup({
      attempts: {
        findAttemptOrders: vi
          .fn()
          .mockResolvedValue({ questionIds: [14, 11], optionOrders: new Map() }),
      },
    });

    const detail = await service.get(5, { id: 7, role: 'user' });

    expect(detail.test).toMatchObject({ id: 1, title: 'Basics', timeLimitMinutes: null });
    // A stored order is the exact asked set: 12 and 13 were not part of it,
    // so they stay out of the attempt even though the test owns them.
    expect(detail.questions.map((question) => question.id)).toEqual([14, 11]);
    const choice = detail.questions.find((question) => question.id === 11);
    expect(choice?.options[0]).not.toHaveProperty('isCorrect');
  });

  it('asks a random subset sized by the test question count', async () => {
    const { service, attempts } = setup({
      tests: {
        findById: vi.fn().mockResolvedValue({ ...publishedTest, questionCount: 2 }),
      },
    });
    const bank = [11, 12, 13, 14];
    const seen = new Set<string>();

    for (let run = 0; run < 40; run += 1) {
      await service.start({ id: 7, role: 'user' }, 1);
      const order = (attempts.createAttempt.mock.calls.at(-1)![0] as { questionIds: number[] })
        .questionIds;
      // Property, not order: exactly N distinct ids, all from the bank.
      expect(order).toHaveLength(2);
      expect(new Set(order).size).toBe(2);
      for (const id of order) expect(bank).toContain(id);
      seen.add([...order].sort((a, b) => a - b).join(','));
    }

    // Repeated runs really do vary the subset, and each run is internally
    // consistent because the fixture allows only one active attempt.
    expect(seen.size).toBeGreaterThan(1);
  });

  it('keeps the manual order for display when sampling without shuffling', async () => {
    const { service, attempts } = setup({
      tests: {
        findById: vi.fn().mockResolvedValue({ ...publishedTest, questionCount: 2 }),
      },
    });
    for (let run = 0; run < 20; run += 1) {
      await service.start({ id: 7, role: 'user' }, 1);
      const order = (attempts.createAttempt.mock.calls.at(-1)![0] as { questionIds: number[] })
        .questionIds;
      // A fixed-order test still varies which questions are asked, but the
      // asked ones keep their orderIndex sequence.
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    }
  });

  it('asks every question when the count is empty, zero, or above the bank size', async () => {
    for (const questionCount of [null, 0, -3, 4, 99]) {
      const { service, attempts } = setup({
        tests: {
          findById: vi.fn().mockResolvedValue({ ...publishedTest, questionCount }),
        },
      });
      await service.start({ id: 7, role: 'user' }, 1);
      expect(attempts.createAttempt, `questionCount ${questionCount}`).toHaveBeenCalledWith(
        expect.objectContaining({ questionIds: [11, 12, 13, 14] }),
      );
    }
  });

  it('excludes unasked questions from the score, records, and result', async () => {
    const sampledOrders = { questionIds: [11, 12], optionOrders: new Map() };
    const sampled = setup({
      attempts: {
        findAttemptOrders: vi.fn().mockResolvedValue(sampledOrders),
        completeAttempt: vi.fn().mockImplementation(async (id: number, outcome: object) => ({
          ...inProgressAttempt,
          id,
          status: 'completed' as const,
          ...outcome,
        })),
      },
    });

    const result = await sampled.service.submit({ id: 7, role: 'user' }, 5, {
      answers: [{ questionId: 11, selectedOptionIds: [101] }],
    });

    // Only the asked pair is graded, so the mean is over those two verdicts:
    // one correct single-choice plus one unanswered multiple-choice (0).
    expect(result.attempt.score).toBe(0.5);
    expect(result.answers.map((answer) => answer.questionId)).toEqual([11, 12]);
    const inserted = sampled.attempts.completeAttempt.mock.calls[0]![2] as Array<{
      questionId: number;
    }>;
    expect([...new Set(inserted.map((record) => record.questionId))].sort((a, b) => a - b)).toEqual(
      [11, 12],
    );

    // The result view shows the same two questions, never the whole bank.
    const graded = setup({
      attempts: {
        findAttemptById: vi.fn().mockResolvedValue({ ...inProgressAttempt, status: 'completed' }),
        findAttemptOrders: vi.fn().mockResolvedValue(sampledOrders),
        findAnswerRecords: vi.fn().mockResolvedValue([]),
      },
    });
    const view = await graded.service.getResult(5, { id: 7, role: 'user' });
    expect(view.questions.map((question) => question.id)).toEqual([11, 12]);
    expect(view.answers.map((answer) => answer.questionId)).toEqual([11, 12]);
  });

  it('rejects answers and grades for questions the attempt never asked', async () => {
    const sampled = setup({
      attempts: {
        findAttemptOrders: vi
          .fn()
          .mockResolvedValue({ questionIds: [11, 12], optionOrders: new Map() }),
      },
    });

    await expect(
      sampled.service.submit({ id: 7, role: 'user' }, 5, {
        answers: [{ questionId: 13, selectedOptionIds: [106] }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const gradable = setup({
      attempts: {
        findAttemptById: vi.fn().mockResolvedValue({ ...inProgressAttempt, status: 'completed' }),
        findAttemptOrders: vi
          .fn()
          .mockResolvedValue({ questionIds: [11, 12], optionOrders: new Map() }),
        findAnswerRecords: vi.fn().mockResolvedValue([]),
      },
    });
    await expect(
      gradable.service.gradeAttempt({ id: 10, role: 'user' }, 5, {
        grades: [{ questionId: 14, isCorrect: true }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(gradable.attempts.updateAnswerVerdicts).not.toHaveBeenCalled();
  });

  it('falls back to every question when no order was stored', async () => {
    const { service } = setup({
      attempts: {
        findAttemptOrders: vi
          .fn()
          .mockResolvedValue({ questionIds: null, optionOrders: new Map() }),
      },
    });

    const detail = await service.get(5, { id: 7, role: 'user' });

    // Attempts without order rows predate the normalized tables: all questions
    // by orderIndex, which is today's behavior.
    expect(detail.questions.map((question) => question.id)).toEqual([11, 12, 13, 14]);
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

  it('awards partial multiple-choice credit while verdicts stay boolean', async () => {
    const { service } = setup();

    const result = await service.submit({ id: 7, role: 'user' } as never, 5, {
      answers: [
        { questionId: 11, selectedOptionIds: [101, 102], textAnswer: null },
        { questionId: 12, selectedOptionIds: [103], textAnswer: null },
        { questionId: 13, selectedOptionIds: [107], textAnswer: null },
      ],
    } as never);

    // Single-choice with two selections and the wrong true/false stay 0;
    // one of two correct multiple-choice options with no wrong pick is 0.5.
    // Only full credit maps to a true verdict; the score averages credits.
    expect(result.attempt.score).toBe(0.17);
    expect(result.answers.map((answer) => answer.isCorrect)).toEqual([false, false, false, null]);
  });

  it('scores a half-correct multiple-choice attempt fractionally', async () => {
    const { service } = setup();

    const result = await service.submit({ id: 7, role: 'user' } as never, 5, {
      answers: [
        { questionId: 11, selectedOptionIds: [101], textAnswer: null },
        { questionId: 12, selectedOptionIds: [103], textAnswer: null },
        { questionId: 13, selectedOptionIds: [106], textAnswer: null },
        { questionId: 14, selectedOptionIds: [], textAnswer: 'Because.' },
      ],
    } as never);

    expect(result.answers.map((answer) => answer.isCorrect)).toEqual([true, false, true, null]);
    expect(result.attempt.score).toBe(0.83);
  });

  describe('scoreOf', () => {
    it('averages non-null credits rounded to two decimals', () => {
      expect(scoreOf([])).toBeNull();
      expect(scoreOf([null, null])).toBeNull();
      expect(scoreOf([1, 1, 1])).toBe(1);
      expect(scoreOf([1, 0.5])).toBe(0.75);
      expect(scoreOf([0, 0.5, 0])).toBe(0.17);
      expect(scoreOf([1, 0.5, null])).toBe(0.75);
      expect(scoreOf([0])).toBe(0);
    });
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

  describe('manual grading', () => {
    const finishedAttempt = {
      ...inProgressAttempt,
      status: 'completed' as const,
      score: null,
      timeSpentSeconds: 60,
      completedAt: new Date(),
    };
    const finishedRecords = [
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
        isCorrect: false,
      },
      {
        id: 3,
        attemptId: 5,
        questionId: 14,
        selectedOptionId: null,
        textAnswer: 'Because.',
        isCorrect: null,
      },
    ];

    function gradingSetup(
      overrides: { tests?: Record<string, unknown>; attempts?: Record<string, unknown> } = {},
    ) {
      return setup({
        tests: {
          findById: vi.fn().mockResolvedValue(publishedTest),
          findQuestions: vi.fn().mockResolvedValue(questions),
          ...overrides.tests,
        },
        attempts: {
          findAttemptById: vi.fn().mockResolvedValue(finishedAttempt),
          findAnswerRecords: vi.fn().mockResolvedValue(finishedRecords),
          ...overrides.attempts,
        },
      });
    }

    it('grades open-ended answers as the author and recomputes the score', async () => {
      const { service, attempts } = gradingSetup();

      const graded = await service.gradeAttempt({ id: 10, role: 'user' }, 5, {
        grades: [{ questionId: 14, isCorrect: true }],
      });

      // Choice credits recomputed from stored selections (single 1,
      // multiple 0.5, unanswered true/false 0) plus the graded open-ended 1:
      // (1 + 0.5 + 0 + 1) / 4 = 0.63.
      expect(attempts.updateAnswerVerdicts).toHaveBeenCalledWith(
        5,
        [{ questionId: 14, isCorrect: true }],
        0.63,
      );
      expect(graded.attempt.score).toBe(0.63);
    });

    it('lets admins grade and keeps ungraded open-ended answers out of the score', async () => {
      const { service, attempts } = gradingSetup();

      await service.gradeAttempt({ id: 99, role: 'admin' }, 5, {
        grades: [{ questionId: 14, isCorrect: false }],
      });

      expect(attempts.updateAnswerVerdicts).toHaveBeenCalledWith(
        5,
        [{ questionId: 14, isCorrect: false }],
        0.38,
      );
    });

    it('rejects grading by the taker, on unfinished attempts, or for missing attempts', async () => {
      const { service } = gradingSetup();
      await expect(
        service.gradeAttempt({ id: 7, role: 'user' }, 5, {
          grades: [{ questionId: 14, isCorrect: true }],
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      const active = gradingSetup({
        attempts: { findAttemptById: vi.fn().mockResolvedValue(inProgressAttempt) },
      });
      await expect(
        active.service.gradeAttempt({ id: 10, role: 'user' }, 5, {
          grades: [{ questionId: 14, isCorrect: true }],
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      const missing = gradingSetup({
        attempts: { findAttemptById: vi.fn().mockResolvedValue(null) },
      });
      await expect(
        missing.service.gradeAttempt({ id: 10, role: 'user' }, 99, {
          grades: [{ questionId: 14, isCorrect: true }],
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('rejects grading choice questions and foreign questions', async () => {
      const { service } = gradingSetup();
      await expect(
        service.gradeAttempt({ id: 10, role: 'user' }, 5, {
          grades: [{ questionId: 11, isCorrect: true }],
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(
        service.gradeAttempt({ id: 10, role: 'user' }, 5, {
          grades: [{ questionId: 999, isCorrect: true }],
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('exposes the grade view to managers only', async () => {
      const { service } = gradingSetup();

      const view = await service.getGradeView(5, { id: 10, role: 'user' });
      expect(view.answersRevealed).toBe(true);
      expect(view.answers).toHaveLength(4);
      expect(view.answers.find((answer) => answer.questionId === 14)).toMatchObject({
        textAnswer: 'Because.',
        isCorrect: null,
      });

      await expect(service.getGradeView(5, { id: 7, role: 'user' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      const active = gradingSetup({
        attempts: { findAttemptById: vi.fn().mockResolvedValue(inProgressAttempt) },
      });
      await expect(active.service.getGradeView(5, { id: 10, role: 'user' })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });
  });
});
