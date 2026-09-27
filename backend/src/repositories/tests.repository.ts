import { and, asc, count, desc, eq, like, or, sql } from 'drizzle-orm';

import type { Difficulty, TestCategory, TestListSort } from '@testopia/shared';

import type { Database } from '../db/client.js';
import { answerOptions, questions, testAttempts, tests } from '../db/schema.js';
import { withTransaction } from '../db/transaction.js';

type QuestionRow = typeof questions.$inferSelect;
type OptionRow = typeof answerOptions.$inferSelect;

export interface ListTestsInput {
  authorId?: number;
  publishedOnly: boolean;
  search?: string;
  category?: TestCategory;
  difficulty?: Difficulty;
  sort?: TestListSort;
  limit?: number;
  offset?: number;
}

// LIKE metacharacters escaped with a backslash (MySQL's default LIKE escape).
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export class TestsRepository {
  constructor(private readonly db: Database) {}

  async create(input: typeof tests.$inferInsert) {
    const result = await this.db.insert(tests).values(input);
    return this.findById(Number(result[0].insertId));
  }

  async findById(id: number) {
    const rows = await this.db.select().from(tests).where(eq(tests.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async list(input: ListTestsInput) {
    const conditions = this.listConditions(input);
    const query = this.db
      .select()
      .from(tests)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(...this.listOrder(input.sort))
      .$dynamic();
    if (input.limit !== undefined) query.limit(input.limit);
    if (input.offset !== undefined) query.offset(input.offset);
    return query;
  }

  // Total of the same filtered set the paginated list() slices — sort and
  // window (limit/offset) never apply here.
  async count(input: ListTestsInput) {
    const conditions = this.listConditions(input);
    const rows = await this.db
      .select({ value: count() })
      .from(tests)
      .where(conditions.length ? and(...conditions) : undefined);
    return Number(rows[0]?.value ?? 0);
  }

  private listConditions(input: ListTestsInput) {
    const conditions = [];
    if (input.authorId !== undefined) conditions.push(eq(tests.authorId, input.authorId));
    if (input.publishedOnly) conditions.push(eq(tests.isPublished, true));
    if (input.category !== undefined) conditions.push(eq(tests.category, input.category));
    if (input.difficulty !== undefined) conditions.push(eq(tests.difficulty, input.difficulty));
    if (input.search !== undefined && input.search !== '') {
      const pattern = `%${escapeLikePattern(input.search)}%`;
      conditions.push(or(like(tests.title, pattern), like(tests.description, pattern)));
    }
    return conditions;
  }

  private listOrder(sort: TestListSort | undefined) {
    switch (sort) {
      case 'popular':
        return [desc(this.attemptCountSubquery()), desc(tests.createdAt)];
      case 'hardest':
        // Lowest average terminal score first; tests without terminal scores
        // (avg is null) sort last. Reuses the statistics
        // avg(case when status in ('completed','expired') then score end)
        // semantics.
        return [
          sql`${this.averageTerminalScoreSubquery()} is null`,
          asc(this.averageTerminalScoreSubquery()),
          desc(tests.createdAt),
        ];
      default:
        return [desc(tests.createdAt)];
    }
  }

  private attemptCountSubquery() {
    return sql<number>`(select count(*) from ${testAttempts} where ${testAttempts.testId} = ${tests.id})`;
  }

  private averageTerminalScoreSubquery() {
    return sql<number>`(select avg(case when ${testAttempts.status} in ('completed', 'expired') then ${testAttempts.score} end) from ${testAttempts} where ${testAttempts.testId} = ${tests.id})`;
  }

  async update(id: number, input: Partial<typeof tests.$inferInsert>) {
    await this.db.update(tests).set(input).where(eq(tests.id, id));
    return this.findById(id);
  }

  async delete(id: number) {
    await this.db.delete(tests).where(eq(tests.id, id));
  }

  async countAttempts(testId: number) {
    const rows = await this.db
      .select({ value: count() })
      .from(testAttempts)
      .where(eq(testAttempts.testId, testId));
    return Number(rows[0]?.value ?? 0);
  }

  async findQuestions(testId: number) {
    const rows = await this.db
      .select({ question: questions, option: answerOptions })
      .from(questions)
      .leftJoin(answerOptions, eq(answerOptions.questionId, questions.id))
      .where(eq(questions.testId, testId))
      .orderBy(asc(questions.orderIndex), asc(answerOptions.id));
    return this.groupQuestionRows(rows);
  }

  async findQuestion(testId: number, questionId: number) {
    const rows = await this.db
      .select()
      .from(questions)
      .where(and(eq(questions.id, questionId), eq(questions.testId, testId)))
      .limit(1);
    const question = rows[0];
    return question ? (await this.withOptions([question]))[0] : null;
  }

  async createQuestion(
    input: typeof questions.$inferInsert,
    options: Array<typeof answerOptions.$inferInsert> = [],
  ) {
    return withTransaction(this.db, async (transaction) => {
      const tx = transaction as unknown as Database;
      const result = await tx.insert(questions).values(input);
      const questionId = Number(result[0].insertId);
      if (options.length) {
        await tx.insert(answerOptions).values(options.map((option) => ({ ...option, questionId })));
      }
      return this.findQuestionWithDatabase(tx, input.testId, questionId);
    });
  }

  async updateQuestion(
    testId: number,
    questionId: number,
    input: Partial<typeof questions.$inferInsert>,
    options?: Array<typeof answerOptions.$inferInsert>,
  ) {
    return withTransaction(this.db, async (transaction) => {
      const tx = transaction as unknown as Database;
      await tx
        .update(questions)
        .set(input)
        .where(and(eq(questions.id, questionId), eq(questions.testId, testId)));
      if (options !== undefined) {
        await tx.delete(answerOptions).where(eq(answerOptions.questionId, questionId));
        if (options.length) {
          await tx
            .insert(answerOptions)
            .values(options.map((option) => ({ ...option, questionId })));
        }
      }
      return this.findQuestionWithDatabase(tx, testId, questionId);
    });
  }

  async deleteQuestion(testId: number, questionId: number) {
    await this.db
      .delete(questions)
      .where(and(eq(questions.id, questionId), eq(questions.testId, testId)));
  }

  private async findQuestionWithDatabase(db: Database, testId: number, questionId: number) {
    const rows = await db
      .select()
      .from(questions)
      .where(and(eq(questions.id, questionId), eq(questions.testId, testId)))
      .limit(1);
    const question = rows[0];
    if (!question) return null;
    const optionRows = await db
      .select()
      .from(answerOptions)
      .where(eq(answerOptions.questionId, questionId));
    return { ...question, options: optionRows };
  }

  private async withOptions(rows: QuestionRow[]) {
    if (!rows.length) return [];
    const result: Array<QuestionRow & { options: OptionRow[] }> = [];
    for (const question of rows) {
      const options = await this.db
        .select()
        .from(answerOptions)
        .where(eq(answerOptions.questionId, question.id));
      result.push({ ...question, options });
    }
    return result;
  }

  private groupQuestionRows(rows: Array<{ question: QuestionRow; option: OptionRow | null }>) {
    const grouped = new Map<number, QuestionRow & { options: OptionRow[] }>();
    for (const row of rows) {
      const question = grouped.get(row.question.id);
      if (question) {
        if (row.option) question.options.push(row.option);
        continue;
      }
      grouped.set(row.question.id, {
        ...row.question,
        options: row.option ? [row.option] : [],
      });
    }
    return [...grouped.values()];
  }
}
