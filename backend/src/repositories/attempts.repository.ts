import { and, desc, eq } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { answerRecords, testAttempts, users } from '../db/schema.js';
import { withTransaction } from '../db/transaction.js';

export type AttemptRow = typeof testAttempts.$inferSelect;
export type AnswerRecordRow = typeof answerRecords.$inferSelect;
export type AnswerRecordInput = typeof answerRecords.$inferInsert;

export class AttemptCompletionRaceError extends Error {
  constructor() {
    super('Attempt was already completed by a concurrent request');
    this.name = 'AttemptCompletionRaceError';
  }
}

export class AttemptsRepository {
  constructor(private readonly db: Database) {}

  async findActiveAttempt(userId: number, testId: number) {
    const rows = await this.db
      .select()
      .from(testAttempts)
      .where(
        and(
          eq(testAttempts.userId, userId),
          eq(testAttempts.testId, testId),
          eq(testAttempts.status, 'in_progress'),
        ),
      )
      .orderBy(desc(testAttempts.startedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async findAttemptById(id: number) {
    const rows = await this.db.select().from(testAttempts).where(eq(testAttempts.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findAnswerRecords(attemptId: number) {
    return this.db.select().from(answerRecords).where(eq(answerRecords.attemptId, attemptId));
  }

  async listAttemptsByTest(testId: number, filter: { userId?: number } = {}) {
    const conditions = [eq(testAttempts.testId, testId)];
    if (filter.userId !== undefined) conditions.push(eq(testAttempts.userId, filter.userId));
    const rows = await this.db
      .select({ attempt: testAttempts, username: users.username })
      .from(testAttempts)
      .innerJoin(users, eq(users.id, testAttempts.userId))
      .where(and(...conditions))
      .orderBy(desc(testAttempts.startedAt), desc(testAttempts.id));
    return rows.map((row) => ({ ...row.attempt, username: row.username }));
  }

  async createAttempt(input: { userId: number; testId: number; questionOrder: number[] | null }) {
    const result = await this.db.insert(testAttempts).values(input);
    return this.findAttemptById(Number(result[0].insertId));
  }

  async completeAttempt(
    id: number,
    outcome: {
      status: 'completed' | 'expired';
      score: number | null;
      timeSpentSeconds: number;
      completedAt: Date;
    },
    answers: AnswerRecordInput[],
  ) {
    try {
      return await withTransaction(this.db, async (transaction) => {
        const tx = transaction as unknown as Database;
        // Optimistic guard: only the request that wins the race out of
        // `in_progress` completes the attempt. Zero affected rows means a
        // concurrent submit already finished it.
        const updated = await tx
          .update(testAttempts)
          .set({
            status: outcome.status,
            score: outcome.score,
            timeSpentSeconds: outcome.timeSpentSeconds,
            completedAt: outcome.completedAt,
          })
          .where(and(eq(testAttempts.id, id), eq(testAttempts.status, 'in_progress')));
        if (updated[0].affectedRows === 0) {
          // Throw to roll back before any answer rows are inserted.
          throw new AttemptCompletionRaceError();
        }
        if (answers.length) {
          await tx.insert(answerRecords).values(answers);
        }
        const rows = await tx.select().from(testAttempts).where(eq(testAttempts.id, id)).limit(1);
        return rows[0] ?? null;
      });
    } catch (error) {
      if (error instanceof AttemptCompletionRaceError) return null;
      throw error;
    }
  }
}
