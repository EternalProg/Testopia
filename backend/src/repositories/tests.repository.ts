import { and, asc, desc, eq } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { answerOptions, questions, tests } from '../db/schema.js';
import { withTransaction } from '../db/transaction.js';

type QuestionRow = typeof questions.$inferSelect;
type OptionRow = typeof answerOptions.$inferSelect;

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

  async list(input: { authorId?: number; publishedOnly: boolean }) {
    const conditions = [];
    if (input.authorId !== undefined) conditions.push(eq(tests.authorId, input.authorId));
    if (input.publishedOnly) conditions.push(eq(tests.isPublished, true));
    return this.db
      .select()
      .from(tests)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(tests.createdAt));
  }

  async update(id: number, input: Partial<typeof tests.$inferInsert>) {
    await this.db.update(tests).set(input).where(eq(tests.id, id));
    return this.findById(id);
  }

  async delete(id: number) {
    await this.db.delete(tests).where(eq(tests.id, id));
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
