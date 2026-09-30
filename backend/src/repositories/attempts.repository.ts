import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import {
  answerRecords,
  attemptQuestionOptions,
  attemptQuestions,
  testAttempts,
  users,
} from '../db/schema.js';
import { withTransaction } from '../db/transaction.js';

export type AttemptRow = typeof testAttempts.$inferSelect;
export type AnswerRecordRow = typeof answerRecords.$inferSelect;
export type AnswerRecordInput = typeof answerRecords.$inferInsert;

export interface CreateAttemptInput {
  userId: number;
  testId: number;
  /** Asked question ids in display order. */
  questionIds: number[];
  /** Per-question option display order; null when options are not shuffled. */
  optionOrders: Record<number, number[]> | null;
}

export interface AttemptOrders {
  /** Asked question ids in display order; null when the attempt predates the
   * normalized order tables and still means "all questions by orderIndex". */
  questionIds: number[] | null;
  /** Per-question option display order, empty when options are not shuffled. */
  optionOrders: Map<number, number[]>;
}

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

  /**
   * Attempts that already consumed the maxAttempts budget. In-progress
   * attempts are excluded on purpose: they resume through findActiveAttempt
   * instead of being counted as used.
   */
  async countTerminalByUser(userId: number, testId: number) {
    const rows = await this.db
      .select({ value: count() })
      .from(testAttempts)
      .where(
        and(
          eq(testAttempts.userId, userId),
          eq(testAttempts.testId, testId),
          inArray(testAttempts.status, ['completed', 'expired']),
        ),
      );
    return Number(rows[0]?.value ?? 0);
  }

  async createAttempt(input: CreateAttemptInput) {
    return withTransaction(this.db, async (transaction) => {
      const tx = transaction as unknown as Database;
      const result = await tx.insert(testAttempts).values({
        userId: input.userId,
        testId: input.testId,
      });
      const attemptId = Number(result[0].insertId);
      if (input.questionIds.length > 0) {
        await tx.insert(attemptQuestions).values(
          input.questionIds.map((questionId, position) => ({
            attemptId,
            questionId,
            position,
          })),
        );
      }
      const optionRows: Array<typeof attemptQuestionOptions.$inferInsert> = [];
      if (input.optionOrders) {
        for (const [questionId, optionIds] of Object.entries(input.optionOrders)) {
          optionIds.forEach((optionId, position) => {
            optionRows.push({ attemptId, questionId: Number(questionId), optionId, position });
          });
        }
      }
      if (optionRows.length > 0) {
        await tx.insert(attemptQuestionOptions).values(optionRows);
      }
      const rows = await tx
        .select()
        .from(testAttempts)
        .where(eq(testAttempts.id, attemptId))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  /**
   * The stored display order for one attempt. Two indexed lookups; callers
   * load once per operation and thread the result through the ordering
   * helpers instead of re-querying per question.
   */
  async findAttemptOrders(attemptId: number): Promise<AttemptOrders> {
    const found = await this.findAttemptOrdersMany([attemptId]);
    return found.get(attemptId) ?? { questionIds: null, optionOrders: new Map() };
  }

  /** Batched variant for history listings: two queries for any number of attempts. */
  async findAttemptOrdersMany(attemptIds: number[]): Promise<Map<number, AttemptOrders>> {
    const orders = new Map<number, AttemptOrders>();
    if (attemptIds.length === 0) return orders;
    const questionRows = await this.db
      .select({
        attemptId: attemptQuestions.attemptId,
        questionId: attemptQuestions.questionId,
      })
      .from(attemptQuestions)
      .where(inArray(attemptQuestions.attemptId, attemptIds))
      .orderBy(asc(attemptQuestions.attemptId), asc(attemptQuestions.position));
    const optionRows = await this.db
      .select({
        attemptId: attemptQuestionOptions.attemptId,
        questionId: attemptQuestionOptions.questionId,
        optionId: attemptQuestionOptions.optionId,
      })
      .from(attemptQuestionOptions)
      .where(inArray(attemptQuestionOptions.attemptId, attemptIds))
      .orderBy(
        asc(attemptQuestionOptions.attemptId),
        asc(attemptQuestionOptions.questionId),
        asc(attemptQuestionOptions.position),
      );
    const questionIdsByAttempt = new Map<number, number[]>();
    for (const row of questionRows) {
      const ids = questionIdsByAttempt.get(row.attemptId);
      if (ids) ids.push(row.questionId);
      else questionIdsByAttempt.set(row.attemptId, [row.questionId]);
    }
    const optionOrdersByAttempt = new Map<number, Map<number, number[]>>();
    for (const row of optionRows) {
      let optionOrders = optionOrdersByAttempt.get(row.attemptId);
      if (!optionOrders) {
        optionOrders = new Map();
        optionOrdersByAttempt.set(row.attemptId, optionOrders);
      }
      const ids = optionOrders.get(row.questionId);
      if (ids) ids.push(row.optionId);
      else optionOrders.set(row.questionId, [row.optionId]);
    }
    for (const attemptId of attemptIds) {
      const questionIds = questionIdsByAttempt.get(attemptId);
      orders.set(attemptId, {
        // Attempts without rows predate the normalized order tables; like
        // the single lookup, they read as "all questions by orderIndex".
        questionIds: questionIds && questionIds.length > 0 ? questionIds : null,
        optionOrders: optionOrdersByAttempt.get(attemptId) ?? new Map(),
      });
    }
    return orders;
  }

  /**
   * Overwrites the verdict of every answer row for the given questions of one
   * attempt (choice answers persist one row per selected option sharing the
   * verdict, so the update is per question, not per row) and writes the
   * recomputed score — atomically.
   */
  async updateAnswerVerdicts(
    attemptId: number,
    verdicts: Array<{ questionId: number; isCorrect: boolean }>,
    score: number | null,
  ) {
    return withTransaction(this.db, async (transaction) => {
      const tx = transaction as unknown as Database;
      for (const verdict of verdicts) {
        await tx
          .update(answerRecords)
          .set({ isCorrect: verdict.isCorrect })
          .where(
            and(
              eq(answerRecords.attemptId, attemptId),
              eq(answerRecords.questionId, verdict.questionId),
            ),
          );
      }
      await tx.update(testAttempts).set({ score }).where(eq(testAttempts.id, attemptId));
      const rows = await tx
        .select()
        .from(testAttempts)
        .where(eq(testAttempts.id, attemptId))
        .limit(1);
      return rows[0] ?? null;
    });
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
