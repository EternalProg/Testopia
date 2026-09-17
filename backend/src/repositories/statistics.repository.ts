import { and, avg, count, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { answerRecords, questions, testAttempts } from '../db/schema.js';

export interface AttemptSummary {
  total: number;
  completed: number;
  avgScore: string | null;
  avgTime: string | null;
}

export interface QuestionCorrectness {
  questionId: number;
  attempts: number;
  correctAnswers: number;
}

export class StatisticsRepository {
  constructor(private readonly db: Database) {}

  async getAttemptSummary(testId: number): Promise<AttemptSummary> {
    const rows = await this.db
      .select({
        total: count(),
        completed: sql<number>`count(case when ${testAttempts.status} = 'completed' then 1 end)`,
        avgScore: avg(
          sql`case when ${testAttempts.status} in ('completed', 'expired') then ${testAttempts.score} end`,
        ),
        avgTime: avg(
          sql`case when ${testAttempts.status} in ('completed', 'expired') then ${testAttempts.timeSpentSeconds} end`,
        ),
      })
      .from(testAttempts)
      .where(eq(testAttempts.testId, testId));
    const row = rows[0];
    if (!row) return { total: 0, completed: 0, avgScore: null, avgTime: null };
    return {
      total: Number(row.total),
      completed: Number(row.completed),
      avgScore: row.avgScore,
      avgTime: row.avgTime,
    };
  }

  async listTerminalScores(testId: number): Promise<number[]> {
    const rows = await this.db
      .select({ score: testAttempts.score })
      .from(testAttempts)
      .where(
        and(
          eq(testAttempts.testId, testId),
          inArray(testAttempts.status, ['completed', 'expired']),
          isNotNull(testAttempts.score),
        ),
      );
    return rows.map((row) => row.score).filter((score): score is number => score !== null);
  }

  async getQuestionCorrectness(testId: number): Promise<QuestionCorrectness[]> {
    const rows = await this.db
      .select({
        questionId: answerRecords.questionId,
        attempts: sql<number>`count(distinct ${answerRecords.attemptId})`,
        // Multiple-choice answers persist one row per selected option sharing the
        // question-level verdict, so distinct attempts dedupe the per-option rows.
        correctAnswers: sql<number>`count(distinct case when ${answerRecords.isCorrect} = 1 then ${answerRecords.attemptId} end)`,
      })
      .from(answerRecords)
      .innerJoin(questions, eq(questions.id, answerRecords.questionId))
      .where(and(eq(questions.testId, testId), isNotNull(answerRecords.isCorrect)))
      .groupBy(answerRecords.questionId);
    return rows.map((row) => ({
      questionId: Number(row.questionId),
      attempts: Number(row.attempts),
      correctAnswers: Number(row.correctAnswers),
    }));
  }
}
