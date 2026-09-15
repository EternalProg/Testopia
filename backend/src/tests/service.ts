import type {
  CreateQuestionInput,
  CreateTestInput,
  Question,
  PublicQuestion,
  Test,
  UpdateQuestionInput,
  UpdateTestInput,
} from '@practice-works/shared';

import type { tests } from '../db/schema.js';
import type { TestsRepository } from '../repositories/tests.repository.js';
import { TestError } from './errors.js';

type Actor = { id: number; role: 'user' | 'admin' };
type StoredQuestion = Awaited<ReturnType<TestsRepository['findQuestion']>>;

export class TestsService {
  constructor(private readonly repository: TestsRepository) {}

  async list(actor: Actor | undefined, scope?: string) {
    if (scope === 'mine') {
      if (!actor) throw new TestError('Authentication required', 'FORBIDDEN');
      return this.repository.list({ authorId: actor.id, publishedOnly: false });
    }
    return this.repository.list({ publishedOnly: true });
  }

  async get(
    id: number,
    actor?: Actor,
  ): Promise<{ test: Test; questions: Array<Question | PublicQuestion> }> {
    const test = await this.requireTest(id);
    if (!test.isPublished && !this.canManage(test, actor)) {
      throw new TestError('Test not found', 'NOT_FOUND');
    }
    const questionRows = await this.repository.findQuestions(id);
    return {
      test: this.publicTest(test),
      questions: questionRows.map((row) =>
        this.publicQuestion(row, !test.isPublished || this.canManage(test, actor)),
      ),
    };
  }

  async create(actor: Actor, input: CreateTestInput) {
    const row = await this.repository.create({
      title: input.title,
      description: input.description ?? null,
      authorId: actor.id,
      isPublished: false,
      shuffleQuestions: input.shuffleQuestions,
      timeLimitMinutes: input.timeLimitMinutes ?? null,
      showAnswersAfterCompletion: input.showAnswersAfterCompletion,
    });
    if (!row) throw new Error('Created test could not be loaded');
    if (input.isPublished) return this.publish(actor, row.id);
    return this.get(row.id, actor);
  }

  async update(actor: Actor, id: number, input: UpdateTestInput) {
    await this.requireManageable(id, actor);
    if (input.isPublished) {
      const { isPublished: _ignored, ...fields } = input;
      await this.repository.update(id, this.testUpdate(fields));
      return this.publish(actor, id);
    }
    const { isPublished: _ignored, ...fields } = input;
    const updated = await this.repository.update(id, this.testUpdate(fields));
    if (!updated) throw new Error('Updated test could not be loaded');
    return this.get(updated.id, actor);
  }

  async remove(actor: Actor, id: number) {
    await this.requireManageable(id, actor);
    await this.repository.delete(id);
  }

  async publish(actor: Actor, id: number) {
    await this.requireManageable(id, actor);
    const questionRows = await this.repository.findQuestions(id);
    if (!questionRows.length)
      throw new TestError('A test must have at least one question', 'VALIDATION_ERROR');
    for (const question of questionRows) this.validateQuestion(question);
    const updated = await this.repository.update(id, { isPublished: true });
    if (!updated) throw new Error('Published test could not be loaded');
    return this.get(updated.id, actor);
  }

  async unpublish(actor: Actor, id: number) {
    await this.requireManageable(id, actor);
    const updated = await this.repository.update(id, { isPublished: false });
    if (!updated) throw new Error('Unpublished test could not be loaded');
    return this.get(updated.id, actor);
  }

  async createQuestion(actor: Actor, testId: number, input: CreateQuestionInput) {
    const test = await this.requireManageable(testId, actor);
    this.validateQuestion(input);
    try {
      const question = await this.repository.createQuestion(
        { testId, text: input.text, type: input.type, orderIndex: input.orderIndex },
        input.options?.map((option) => ({
          questionId: 0,
          text: option.text,
          isCorrect: option.isCorrect,
        })),
      );
      if (!question) throw new Error('Created question could not be loaded');
      if (test.isPublished) await this.repository.update(testId, { isPublished: false });
      return this.privateQuestion(question);
    } catch (error) {
      throw this.mapPersistenceError(error);
    }
  }

  async updateQuestion(
    actor: Actor,
    testId: number,
    questionId: number,
    input: UpdateQuestionInput,
  ) {
    const test = await this.requireManageable(testId, actor);
    const current = await this.repository.findQuestion(testId, questionId);
    if (!current) throw new TestError('Question not found', 'NOT_FOUND');
    const merged = {
      text: input.text ?? current.text,
      type: input.type ?? current.type,
      orderIndex: input.orderIndex ?? current.orderIndex,
      options: input.options ?? current.options.map(({ text, isCorrect }) => ({ text, isCorrect })),
    };
    this.validateQuestion(merged);
    try {
      const question = await this.repository.updateQuestion(
        testId,
        questionId,
        { text: merged.text, type: merged.type, orderIndex: merged.orderIndex },
        input.options === undefined
          ? undefined
          : input.options.map((option) => ({
              questionId,
              text: option.text,
              isCorrect: option.isCorrect,
            })),
      );
      if (!question) throw new TestError('Question not found', 'NOT_FOUND');
      if (test.isPublished) await this.repository.update(testId, { isPublished: false });
      return this.privateQuestion(question);
    } catch (error) {
      throw this.mapPersistenceError(error);
    }
  }

  async deleteQuestion(actor: Actor, testId: number, questionId: number) {
    await this.requireManageable(testId, actor);
    if (!(await this.repository.findQuestion(testId, questionId))) {
      throw new TestError('Question not found', 'NOT_FOUND');
    }
    await this.repository.deleteQuestion(testId, questionId);
  }

  private async requireTest(id: number) {
    const test = await this.repository.findById(id);
    if (!test) throw new TestError('Test not found', 'NOT_FOUND');
    return test;
  }

  private async requireManageable(id: number, actor: Actor) {
    const test = await this.requireTest(id);
    if (!this.canManage(test, actor)) throw new TestError('Insufficient permissions', 'FORBIDDEN');
    return test;
  }

  private canManage(test: { authorId: number }, actor?: Actor) {
    return !!actor && (actor.role === 'admin' || actor.id === test.authorId);
  }

  private validateQuestion(question: {
    type: string;
    options?: Array<{ isCorrect: boolean }> | undefined;
  }) {
    const options = question.options ?? [];
    if (question.type === 'open_ended' && options.length) {
      throw new TestError('Open-ended questions cannot have options', 'VALIDATION_ERROR');
    }
    if (
      question.type === 'single_choice' &&
      (options.length < 2 || options.filter((option) => option.isCorrect).length !== 1)
    ) {
      throw new TestError(
        'Single-choice questions require exactly one correct option',
        'VALIDATION_ERROR',
      );
    }
    if (
      question.type === 'multiple_choice' &&
      (options.length < 2 || !options.some((option) => option.isCorrect))
    ) {
      throw new TestError('Multiple-choice questions require a correct option', 'VALIDATION_ERROR');
    }
    if (
      question.type === 'true_false' &&
      (options.length !== 2 || options.filter((option) => option.isCorrect).length !== 1)
    ) {
      throw new TestError(
        'True-false questions require two options and one correct option',
        'VALIDATION_ERROR',
      );
    }
  }

  private testUpdate(input: UpdateTestInput) {
    return {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.shuffleQuestions === undefined ? {} : { shuffleQuestions: input.shuffleQuestions }),
      ...(input.timeLimitMinutes === undefined ? {} : { timeLimitMinutes: input.timeLimitMinutes }),
      ...(input.showAnswersAfterCompletion === undefined
        ? {}
        : { showAnswersAfterCompletion: input.showAnswersAfterCompletion }),
    };
  }

  private publicTest(test: typeof tests.$inferSelect): Test {
    return test;
  }

  private publicQuestion(
    question: Awaited<ReturnType<TestsRepository['findQuestions']>>[number],
    includeCorrect: boolean,
  ): Question | PublicQuestion {
    return {
      ...question,
      options: includeCorrect
        ? question.options
        : question.options.map(({ isCorrect: _isCorrect, ...option }) => option),
    };
  }

  private privateQuestion(question: StoredQuestion) {
    if (!question) throw new Error('Question could not be loaded');
    return question;
  }

  private mapPersistenceError(error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ER_DUP_ENTRY'
    ) {
      return new TestError('Question order must be unique within a test', 'CONFLICT');
    }
    return error;
  }
}
