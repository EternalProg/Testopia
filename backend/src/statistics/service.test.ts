import { describe, expect, it, vi } from 'vitest';

import {
  aggregateMyStatistics,
  averageScoreOf,
  averageTimeOf,
  bucketIndexForScore,
  buildScoreDistribution,
  completionRateOf,
  StatisticsService,
} from './service.js';

const draftTest = {
  id: 1,
  title: 'Draft',
  description: null,
  authorId: 10,
  isPublished: false,
  shuffleQuestions: false,
  timeLimitMinutes: null,
  showAnswersAfterCompletion: true,
  showQuestionsBeforeStart: true,
  availableFrom: null,
  availableUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const publishedTest = { ...draftTest, isPublished: true };

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
    text: 'Explain',
    type: 'open_ended' as const,
    orderIndex: 2,
    options: [],
  },
];

function setup(
  overrides: { tests?: Record<string, unknown>; statistics?: Record<string, unknown> } = {},
) {
  const tests = {
    findById: vi.fn().mockResolvedValue(publishedTest),
    findQuestions: vi.fn().mockResolvedValue(questions),
    ...overrides.tests,
  };
  const statistics = {
    getAttemptSummary: vi
      .fn()
      .mockResolvedValue({ total: 0, completed: 0, avgScore: null, avgTime: null }),
    listTerminalScores: vi.fn().mockResolvedValue([]),
    getQuestionCorrectness: vi.fn().mockResolvedValue([]),
    countUniqueTakers: vi.fn().mockResolvedValue(0),
    listAttemptsByUser: vi.fn().mockResolvedValue([]),
    ...overrides.statistics,
  };
  return {
    tests,
    statistics,
    service: new StatisticsService(statistics as never, tests as never),
  };
}

describe('StatisticsService', () => {
  it('counts every attempt but averages only terminal attempts', async () => {
    const { service } = setup({
      statistics: {
        getAttemptSummary: vi.fn().mockResolvedValue({
          total: 4,
          completed: 2,
          avgScore: '0.7500',
          avgTime: '62.5',
        }),
        // One in_progress attempt is counted in the summary but excluded here.
        listTerminalScores: vi.fn().mockResolvedValue([1, 0.5, 0.75]),
        getQuestionCorrectness: vi
          .fn()
          .mockResolvedValue([{ questionId: 11, attempts: 3, correctAnswers: 2 }]),
      },
    });

    const stats = await service.getStatistics({ id: 10, role: 'user' }, 1);

    expect(stats.attemptsCount).toBe(4);
    expect(stats.completedAttemptsCount).toBe(2);
    expect(stats.averageScore).toBe(0.75);
    expect(stats.averageTimeSeconds).toBe(63);
  });

  it('places boundary scores into the correct decile buckets', () => {
    expect(bucketIndexForScore(0)).toBe(0);
    expect(bucketIndexForScore(0.05)).toBe(0);
    expect(bucketIndexForScore(1)).toBe(9);

    const distribution = buildScoreDistribution([0, 0.05, 1]);
    expect(distribution).toHaveLength(10);
    expect(distribution[0]).toMatchObject({ min: 0, max: 10, count: 2 });
    expect(distribution[9]).toMatchObject({ min: 90, max: 100, count: 1 });
    expect(distribution.slice(1, 9).every((bucket) => bucket.count === 0)).toBe(true);
  });

  it('aggregates deduped multi-choice correctness into per-question ratios', async () => {
    const { service } = setup({
      statistics: {
        getAttemptSummary: vi.fn().mockResolvedValue({
          total: 2,
          completed: 2,
          avgScore: '0.5',
          avgTime: '60',
        }),
        listTerminalScores: vi.fn().mockResolvedValue([0.5, 0.5]),
        // Multi-choice persists one row per selected option; the repository
        // reports distinct attempts so the service consumes ready aggregates.
        getQuestionCorrectness: vi.fn().mockResolvedValue([
          { questionId: 11, attempts: 2, correctAnswers: 1 },
          { questionId: 12, attempts: 2, correctAnswers: 2 },
        ]),
      },
    });

    const stats = await service.getStatistics({ id: 10, role: 'user' }, 1);

    expect(stats.questionStats).toEqual([
      { questionId: 11, text: 'Single', attempts: 2, correctAnswers: 1, correctnessRate: 0.5 },
      { questionId: 12, text: 'Multi', attempts: 2, correctAnswers: 2, correctnessRate: 1 },
      { questionId: 13, text: 'Explain', attempts: 0, correctAnswers: 0, correctnessRate: null },
    ]);
  });

  it('reports zeros and nulls for ungraded open-ended questions', async () => {
    const { service } = setup({
      statistics: {
        getAttemptSummary: vi.fn().mockResolvedValue({
          total: 1,
          completed: 1,
          avgScore: null,
          avgTime: '45',
        }),
        listTerminalScores: vi.fn().mockResolvedValue([]),
        getQuestionCorrectness: vi.fn().mockResolvedValue([]),
      },
    });

    const stats = await service.getStatistics({ id: 10, role: 'user' }, 1);

    expect(stats.averageScore).toBeNull();
    expect(stats.averageTimeSeconds).toBe(45);
    for (const question of stats.questionStats) {
      expect(question).toMatchObject({ attempts: 0, correctAnswers: 0, correctnessRate: null });
    }
  });

  it('returns nulls and empty buckets when a test has no attempts', async () => {
    const { service } = setup();

    const stats = await service.getStatistics({ id: 10, role: 'user' }, 1);

    expect(stats).toMatchObject({
      testId: 1,
      attemptsCount: 0,
      completedAttemptsCount: 0,
      averageScore: null,
      averageTimeSeconds: null,
    });
    expect(stats.scoreDistribution).toHaveLength(10);
    expect(stats.scoreDistribution.every((bucket) => bucket.count === 0)).toBe(true);
    expect(stats.questionStats).toHaveLength(3);
  });

  it('rejects unauthenticated readers with an unauthorized error', async () => {
    const { service } = setup();
    await expect(service.getStatistics(undefined, 1)).rejects.toMatchObject({
      name: 'AuthError',
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects takers on published and draft tests', async () => {
    for (const test of [publishedTest, draftTest]) {
      const taker = setup({ tests: { findById: vi.fn().mockResolvedValue(test) } });
      await expect(taker.service.getStatistics({ id: 7, role: 'user' }, 1)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    }
  });

  it('returns 404 for a missing test', async () => {
    const { service } = setup({ tests: { findById: vi.fn().mockResolvedValue(null) } });
    await expect(service.getStatistics({ id: 10, role: 'user' }, 99)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('lets authors and admins read statistics on drafts', async () => {
    const author = setup({ tests: { findById: vi.fn().mockResolvedValue(draftTest) } });
    await expect(author.service.getStatistics({ id: 10, role: 'user' }, 1)).resolves.toMatchObject({
      testId: 1,
    });

    const admin = setup({ tests: { findById: vi.fn().mockResolvedValue(draftTest) } });
    await expect(admin.service.getStatistics({ id: 99, role: 'admin' }, 1)).resolves.toMatchObject({
      testId: 1,
    });
  });

  it('rounds score averages to two decimals and times to whole seconds', () => {
    expect(averageScoreOf('0.6667')).toBe(0.67);
    expect(averageScoreOf(1)).toBe(1);
    expect(averageScoreOf(null)).toBeNull();
    expect(averageTimeOf('62.5')).toBe(63);
    expect(averageTimeOf(null)).toBeNull();
  });

  it('reports unique takers and completion rate alongside the summary', async () => {
    const { service, statistics } = setup({
      statistics: {
        getAttemptSummary: vi.fn().mockResolvedValue({
          total: 4,
          completed: 2,
          avgScore: '0.5',
          avgTime: '60',
        }),
        countUniqueTakers: vi.fn().mockResolvedValue(3),
      },
    });

    const stats = await service.getStatistics({ id: 10, role: 'user' }, 1);

    expect(stats.uniqueTakers).toBe(3);
    expect(stats.completionRate).toBe(0.5);
    expect(statistics.countUniqueTakers).toHaveBeenCalledWith(1);
  });

  it('returns a null completion rate when a test has no attempts', async () => {
    const { service } = setup();

    const stats = await service.getStatistics({ id: 10, role: 'user' }, 1);

    expect(stats.uniqueTakers).toBe(0);
    expect(stats.completionRate).toBeNull();
  });

  it('computes completion rates with rounding and a null empty state', () => {
    expect(completionRateOf(0, 0)).toBeNull();
    expect(completionRateOf(2, 4)).toBe(0.5);
    expect(completionRateOf(2, 3)).toBe(0.67);
    expect(completionRateOf(0, 5)).toBe(0);
  });

  it('aggregates a taker overview across tests with best/last selection', async () => {
    const { service } = setup({
      statistics: {
        // Newest-first, as returned by the repository ordering.
        listAttemptsByUser: vi.fn().mockResolvedValue([
          {
            testId: 2,
            title: 'Geometry',
            status: 'completed',
            score: 0.5,
            startedAt: new Date('2026-03-03T00:00:00.000Z'),
            completedAt: new Date('2026-03-03T00:05:00.000Z'),
          },
          {
            testId: 1,
            title: 'Algebra',
            status: 'in_progress',
            score: null,
            startedAt: new Date('2026-03-02T00:00:00.000Z'),
            completedAt: null,
          },
          {
            testId: 1,
            title: 'Algebra',
            status: 'expired',
            score: 0.75,
            startedAt: new Date('2026-03-01T00:00:00.000Z'),
            completedAt: new Date('2026-03-01T00:10:00.000Z'),
          },
          {
            testId: 1,
            title: 'Algebra',
            status: 'completed',
            score: 1,
            startedAt: new Date('2026-02-01T00:00:00.000Z'),
            completedAt: new Date('2026-02-01T00:05:00.000Z'),
          },
        ]),
      },
    });

    const stats = await service.getMyStatistics({ id: 7, role: 'user' });

    expect(stats.testsTaken).toBe(2);
    expect(stats.totalAttempts).toBe(4);
    // Expired attempts are visible but never count as passed.
    expect(stats.completedAttempts).toBe(2);
    expect(stats.passRate).toBe(0.5);
    expect(stats.averageScore).toBe(0.75);
    expect(stats.averageAttemptsPerTest).toBe(2);
    expect(stats.bestScore).toBe(1);
    expect(stats.tests).toEqual([
      {
        testId: 2,
        title: 'Geometry',
        attempts: 1,
        bestScore: 0.5,
        lastScore: 0.5,
        lastTakenAt: new Date('2026-03-03T00:00:00.000Z'),
        lastStatus: 'completed',
      },
      {
        testId: 1,
        title: 'Algebra',
        attempts: 3,
        bestScore: 1,
        lastScore: null,
        lastTakenAt: new Date('2026-03-02T00:00:00.000Z'),
        lastStatus: 'in_progress',
      },
    ]);
  });

  it('excludes null scores from averages and best scores', () => {
    const stats = aggregateMyStatistics([
      {
        testId: 1,
        title: 'Ungraded',
        status: 'completed',
        score: null,
        startedAt: new Date('2026-03-01T00:00:00.000Z'),
        completedAt: new Date('2026-03-01T00:05:00.000Z'),
      },
    ]);

    expect(stats.completedAttempts).toBe(1);
    expect(stats.passRate).toBe(1);
    expect(stats.averageScore).toBeNull();
    expect(stats.bestScore).toBeNull();
    expect(stats.tests).toEqual([
      {
        testId: 1,
        title: 'Ungraded',
        attempts: 1,
        bestScore: null,
        lastScore: null,
        lastTakenAt: new Date('2026-03-01T00:00:00.000Z'),
        lastStatus: 'completed',
      },
    ]);
  });

  it('returns zeros and nulls when the taker has no attempts', async () => {
    const { service, statistics } = setup();

    const stats = await service.getMyStatistics({ id: 7, role: 'user' });

    expect(statistics.listAttemptsByUser).toHaveBeenCalledWith(7);
    expect(stats).toEqual({
      testsTaken: 0,
      totalAttempts: 0,
      completedAttempts: 0,
      passRate: null,
      averageScore: null,
      averageAttemptsPerTest: null,
      bestScore: null,
      tests: [],
    });
  });

  it('rejects unauthenticated taker-overview reads', async () => {
    const { service } = setup();
    await expect(service.getMyStatistics(undefined)).rejects.toMatchObject({
      name: 'AuthError',
      code: 'UNAUTHORIZED',
    });
  });
});
