import type { MyStatistics, MyTestStatItem, ScoreBucket, TestStats } from '@testopia/shared';

import { AuthError } from '../auth/errors.js';
import type {
  StatisticsRepository,
  UserAttemptRow,
} from '../repositories/statistics.repository.js';
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

export function completionRateOf(completed: number, total: number): number | null {
  if (total === 0) return null;
  return round2(completed / total);
}

function isTerminalScore(row: UserAttemptRow): row is UserAttemptRow & { score: number } {
  return (
    (row.status === 'completed' || row.status === 'expired') &&
    row.score !== null &&
    Number.isFinite(row.score)
  );
}

export function aggregateMyStatistics(rows: UserAttemptRow[]): MyStatistics {
  const totalAttempts = rows.length;
  const completedAttempts = rows.filter((row) => row.status === 'completed').length;
  const terminalScores = rows.filter(isTerminalScore).map((row) => row.score);

  const byTest = new Map<number, { title: string; rows: UserAttemptRow[] }>();
  for (const row of rows) {
    const group = byTest.get(row.testId);
    if (group) group.rows.push(row);
    else byTest.set(row.testId, { title: row.title, rows: [row] });
  }

  const tests: MyTestStatItem[] = [...byTest.entries()].map(([testId, group]) => {
    // Rows arrive newest-first, so the first row is the latest attempt.
    const last = group.rows[0]!;
    const best = group.rows.filter(isTerminalScore).map((row) => row.score);
    return {
      testId,
      title: group.title,
      attempts: group.rows.length,
      bestScore: best.length === 0 ? null : Math.max(...best),
      lastScore: last.score,
      lastTakenAt: last.startedAt,
      lastStatus: last.status,
    };
  });

  return {
    testsTaken: byTest.size,
    totalAttempts,
    completedAttempts,
    passRate: completionRateOf(completedAttempts, totalAttempts),
    averageScore:
      terminalScores.length === 0
        ? null
        : round2(terminalScores.reduce((sum, score) => sum + score, 0) / terminalScores.length),
    averageAttemptsPerTest: byTest.size === 0 ? null : round2(totalAttempts / byTest.size),
    bestScore: terminalScores.length === 0 ? null : Math.max(...terminalScores),
    tests,
  };
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

    const [summary, scores, correctness, questionRows, uniqueTakers] = await Promise.all([
      this.statistics.getAttemptSummary(testId),
      this.statistics.listTerminalScores(testId),
      this.statistics.getQuestionCorrectness(testId),
      this.tests.findQuestions(testId),
      this.statistics.countUniqueTakers(testId),
    ]);

    const gradedByQuestion = new Map(correctness.map((entry) => [entry.questionId, entry]));

    return {
      testId,
      attemptsCount: summary.total,
      completedAttemptsCount: summary.completed,
      uniqueTakers,
      completionRate: completionRateOf(summary.completed, summary.total),
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

  async getMyStatistics(actor: Actor | undefined): Promise<MyStatistics> {
    if (!actor) throw new AuthError('Authentication required', 'UNAUTHORIZED');
    const rows = await this.statistics.listAttemptsByUser(actor.id);
    return aggregateMyStatistics(rows);
  }
}
