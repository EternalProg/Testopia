import type { ScoreBucket, TestStats } from '@testopia/shared';

import { AuthError } from '../auth/errors.js';
import type { StatisticsRepository } from '../repositories/statistics.repository.js';
import type { TestsRepository } from '../repositories/tests.repository.js';
import { StatisticsError } from './errors.js';

type Actor = { id: number; role: 'user' | 'admin' };

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function bucketIndexForScore(score: number): number {
  const percent = Math.round(score * 100);
  return Math.min(9, Math.max(0, Math.floor(percent / 10)));
}

export function buildScoreDistribution(scores: Array<number | string>): ScoreBucket[] {
  const buckets: ScoreBucket[] = Array.from({ length: 10 }, (_, index) => ({
    min: index * 10,
    max: index * 10 + 10,
    count: 0,
  }));
  for (const raw of scores) {
    const score = Number(raw);
    if (!Number.isFinite(score)) continue;
    buckets[bucketIndexForScore(score)]!.count += 1;
  }
  return buckets;
}

export function averageScoreOf(avgScore: string | number | null): number | null {
  if (avgScore === null || avgScore === undefined) return null;
  const value = Number(avgScore);
  if (!Number.isFinite(value)) return null;
  return round2(value);
}

export function averageTimeOf(avgTime: string | number | null): number | null {
  if (avgTime === null || avgTime === undefined) return null;
  const value = Number(avgTime);
  if (!Number.isFinite(value)) return null;
  return Math.round(value);
}

export class StatisticsService {
  constructor(
    private readonly statistics: StatisticsRepository,
    private readonly tests: TestsRepository,
  ) {}

  async getStatistics(actor: Actor | undefined, testId: number): Promise<TestStats> {
    if (!actor) throw new AuthError('Authentication required', 'UNAUTHORIZED');
    const test = await this.tests.findById(testId);
    if (!test) throw new StatisticsError('Test not found', 'NOT_FOUND');
    if (actor.role !== 'admin' && actor.id !== test.authorId) {
      throw new StatisticsError('Insufficient permissions', 'FORBIDDEN');
    }

    const [summary, scores, correctness, questionRows] = await Promise.all([
      this.statistics.getAttemptSummary(testId),
      this.statistics.listTerminalScores(testId),
      this.statistics.getQuestionCorrectness(testId),
      this.tests.findQuestions(testId),
    ]);

    const gradedByQuestion = new Map(correctness.map((entry) => [entry.questionId, entry]));

    return {
      testId,
      attemptsCount: summary.total,
      completedAttemptsCount: summary.completed,
      averageScore: averageScoreOf(summary.avgScore),
      averageTimeSeconds: averageTimeOf(summary.avgTime),
      scoreDistribution: buildScoreDistribution(scores),
      questionStats: questionRows.map((question) => {
        const graded = gradedByQuestion.get(question.id);
        if (!graded || graded.attempts === 0) {
          return {
            questionId: question.id,
            text: question.text,
            attempts: 0,
            correctAnswers: 0,
            correctnessRate: null,
          };
        }
        return {
          questionId: question.id,
          text: question.text,
          attempts: graded.attempts,
          correctAnswers: graded.correctAnswers,
          correctnessRate: round2(graded.correctAnswers / graded.attempts),
        };
      }),
    };
  }
}
