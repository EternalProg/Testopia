import type {
  AttemptAnswer,
  AttemptDetail,
  AttemptHistoryItem,
  AttemptResult,
  PublicQuestion,
  ResultQuestion,
  SubmitAttemptInput,
  SubmitAttemptResult,
  TestAttempt,
} from '@testopia/shared';

import type {
  AnswerRecordInput,
  AnswerRecordRow,
  AttemptRow,
  AttemptsRepository,
} from '../repositories/attempts.repository.js';
import type { TestsRepository } from '../repositories/tests.repository.js';
import { AttemptError } from './errors.js';

type Actor = { id: number; role: 'user' | 'admin' };
type TestRow = Awaited<ReturnType<TestsRepository['findById']>>;
type QuestionWithOptions = Awaited<ReturnType<TestsRepository['findQuestions']>>[number];

export class AttemptsService {
  constructor(
    private readonly tests: TestsRepository,
    private readonly attempts: AttemptsRepository,
  ) {}

  async start(actor: Actor, testId: number): Promise<AttemptDetail> {
    const test = await this.requirePublishedTest(testId);
    const active = await this.attempts.findActiveAttempt(actor.id, testId);
    if (active) {
      if (this.isPastDeadline(active, test)) {
        // A null result means a concurrent submit already finished the
        // attempt; either way it is terminal, so fall through and start fresh.
        await this.attempts.completeAttempt(
          active.id,
          {
            status: 'expired',
            score: null,
            timeSpentSeconds: this.timeSpentSeconds(active, new Date()),
            completedAt: new Date(),
          },
          [],
        );
      } else {
        return this.detail(active);
      }
    }
    const questions = await this.tests.findQuestions(testId);
    const created = await this.attempts.createAttempt({
      userId: actor.id,
      testId,
      questionOrder: this.buildQuestionOrder(test, questions),
    });
    if (!created) throw new Error('Created attempt could not be loaded');
    return this.detail(created);
  }

  async get(attemptId: number, actor: Actor): Promise<AttemptDetail> {
    const attempt = await this.requireOwnedAttempt(attemptId, actor);
    return this.detail(attempt);
  }

  async getResult(attemptId: number, actor: Actor): Promise<AttemptResult> {
    const attempt = await this.requireOwnedAttempt(attemptId, actor);
    if (attempt.status === 'in_progress') {
      throw new AttemptError('Attempt is still in progress', 'CONFLICT');
    }
    const test = await this.tests.findById(attempt.testId);
    if (!test) throw new AttemptError('Test not found', 'NOT_FOUND');
    const questions = await this.tests.findQuestions(test.id);
    const records = await this.attempts.findAnswerRecords(attempt.id);
    const answers = this.reconstructAnswers(questions, attempt, records);
    return this.toResult(attempt, test, questions, answers, this.isRevealed(test, actor));
  }

  async listHistory(actor: Actor, testId: number): Promise<AttemptHistoryItem[]> {
    const test = await this.tests.findById(testId);
    if (!test) throw new AttemptError('Test not found', 'NOT_FOUND');
    const revealed = this.isRevealed(test, actor);
    const rows = this.canManage(test, actor)
      ? await this.attempts.listAttemptsByTest(testId)
      : await this.attempts.listAttemptsByTest(testId, { userId: actor.id });
    // Redaction is mapping-time only: persisted rows keep their real scores.
    return rows.map((row) => {
      const attempt = this.toAttempt(row);
      if (!revealed) attempt.score = null;
      return { ...attempt, username: row.username, answersRevealed: revealed };
    });
  }

  async submit(
    actor: Actor,
    attemptId: number,
    input: SubmitAttemptInput,
  ): Promise<SubmitAttemptResult> {
    const attempt = await this.requireOwnedAttempt(attemptId, actor);
    if (attempt.status !== 'in_progress') {
      throw new AttemptError('Attempt has already been submitted', 'CONFLICT');
    }
    const test = await this.tests.findById(attempt.testId);
    if (!test) throw new AttemptError('Test not found', 'NOT_FOUND');
    const questions = await this.tests.findQuestions(test.id);
    const byId = new Map(questions.map((question) => [question.id, question]));
    for (const answer of input.answers) {
      const question = byId.get(answer.questionId);
      if (!question) {
        throw new AttemptError(
          `Question ${answer.questionId} does not belong to this test`,
          'VALIDATION_ERROR',
        );
      }
      const optionIds = new Set(question.options.map((option) => option.id));
      for (const selectedId of answer.selectedOptionIds) {
        if (!optionIds.has(selectedId)) {
          throw new AttemptError(
            `Option ${selectedId} does not belong to question ${answer.questionId}`,
            'VALIDATION_ERROR',
          );
        }
      }
    }

    const submitted = new Map(input.answers.map((answer) => [answer.questionId, answer]));
    const answers: AttemptAnswer[] = [];
    const records: AnswerRecordInput[] = [];
    let autoCorrect = 0;
    let autoTotal = 0;
    for (const question of questions) {
      const answer = submitted.get(question.id);
      const selectedIds = answer?.selectedOptionIds ?? [];
      const textAnswer = answer?.textAnswer ?? null;
      const isCorrect = this.grade(question, selectedIds);
      if (isCorrect !== null) {
        autoTotal += 1;
        if (isCorrect) autoCorrect += 1;
      }
      answers.push({
        questionId: question.id,
        selectedOptionIds: selectedIds,
        textAnswer,
        isCorrect,
      });
      if (question.type === 'open_ended' || selectedIds.length === 0) {
        records.push({
          attemptId: attempt.id,
          questionId: question.id,
          selectedOptionId: null,
          textAnswer,
          isCorrect,
        });
      } else {
        for (const selectedOptionId of selectedIds) {
          records.push({
            attemptId: attempt.id,
            questionId: question.id,
            selectedOptionId,
            textAnswer,
            isCorrect,
          });
        }
      }
    }

    const score = autoTotal === 0 ? null : Math.round((autoCorrect / autoTotal) * 100) / 100;
    const completedAt = new Date();
    const status = this.isPastDeadline({ startedAt: attempt.startedAt }, test)
      ? 'expired'
      : 'completed';
    const completed = await this.attempts.completeAttempt(
      attempt.id,
      { status, score, timeSpentSeconds: this.timeSpentSeconds(attempt, completedAt), completedAt },
      records,
    );
    if (!completed) {
      // The guarded update affected zero rows: a concurrent submit won the
      // race and already finished this attempt.
      throw new AttemptError('Attempt has already been submitted', 'CONFLICT');
    }
    const result: SubmitAttemptResult = {
      attempt: this.toAttempt(completed),
      answers,
      answersRevealed: this.isRevealed(test, actor),
    };
    if (!result.answersRevealed) {
      // Redaction is mapping-time only: the persisted attempt keeps its real
      // score and the stored answer rows keep their verdicts.
      result.attempt.score = null;
      result.answers = result.answers.map((answer) => ({ ...answer, isCorrect: null }));
    }
    if (status === 'expired') {
      throw new AttemptError('Time limit exceeded', 'EXPIRED', result);
    }
    return result;
  }

  private async requirePublishedTest(id: number): Promise<NonNullable<TestRow>> {
    const test = await this.tests.findById(id);
    if (!test || !test.isPublished) throw new AttemptError('Test not found', 'NOT_FOUND');
    return test;
  }

  private async requireOwnedAttempt(attemptId: number, actor: Actor): Promise<AttemptRow> {
    const attempt = await this.attempts.findAttemptById(attemptId);
    if (!attempt) throw new AttemptError('Attempt not found', 'NOT_FOUND');
    if (attempt.userId !== actor.id && actor.role !== 'admin') {
      throw new AttemptError('Insufficient permissions', 'FORBIDDEN');
    }
    return attempt;
  }

  private async detail(attempt: AttemptRow): Promise<AttemptDetail> {
    // The taking page derives its countdown and heading from this embedded
    // test info so it never depends on a secondary test fetch that could fail
    // while the attempt itself loaded fine.
    const test = await this.tests.findById(attempt.testId);
    if (!test) throw new AttemptError('Test not found', 'NOT_FOUND');
    const questions = await this.tests.findQuestions(attempt.testId);
    return {
      attempt: this.toAttempt(attempt),
      test: { id: test.id, title: test.title, timeLimitMinutes: test.timeLimitMinutes },
      questions: this.orderedPublicQuestions(questions, attempt),
    };
  }

  private orderedPublicQuestions(
    questions: QuestionWithOptions[],
    attempt: AttemptRow,
  ): PublicQuestion[] {
    return this.orderedQuestions(questions, attempt).map((question) => ({
      ...question,
      options: question.options.map(({ isCorrect: _isCorrect, ...option }) => option),
    }));
  }

  private orderedQuestions(
    questions: QuestionWithOptions[],
    attempt: AttemptRow,
  ): QuestionWithOptions[] {
    const order = attempt.questionOrder;
    if (!order || !order.length) {
      return [...questions].sort((a, b) => a.orderIndex - b.orderIndex);
    }
    const byId = new Map(questions.map((question) => [question.id, question]));
    const ordered = order
      .map((id) => byId.get(id))
      .filter((question): question is QuestionWithOptions => !!question);
    for (const question of questions) {
      if (!order.includes(question.id)) ordered.push(question);
    }
    return ordered;
  }

  private reconstructAnswers(
    questions: QuestionWithOptions[],
    attempt: AttemptRow,
    records: AnswerRecordRow[],
  ): AttemptAnswer[] {
    const byQuestion = new Map<number, AnswerRecordRow[]>();
    for (const record of records) {
      const group = byQuestion.get(record.questionId);
      if (group) group.push(record);
      else byQuestion.set(record.questionId, [record]);
    }
    // Choice answers persist one row per selected option id, each carrying the
    // same question-level verdict; open-ended and unanswered questions persist
    // a single row. Questions without rows default to empty/null.
    return this.orderedQuestions(questions, attempt).map((question) => {
      const rows = byQuestion.get(question.id) ?? [];
      const selectedOptionIds = [
        ...new Set(
          rows.map((row) => row.selectedOptionId).filter((id): id is number => id !== null),
        ),
      ];
      return {
        questionId: question.id,
        selectedOptionIds,
        textAnswer: rows[0]?.textAnswer ?? null,
        isCorrect: rows[0]?.isCorrect ?? null,
      };
    });
  }

  private toResult(
    attempt: AttemptRow,
    test: NonNullable<TestRow>,
    questions: QuestionWithOptions[],
    answers: AttemptAnswer[],
    revealed: boolean,
  ): AttemptResult {
    const ordered = this.orderedQuestions(questions, attempt);
    const resultQuestions: ResultQuestion[] = revealed
      ? ordered.map((question) => ({ ...question }))
      : ordered.map((question) => ({
          ...question,
          options: question.options.map(({ isCorrect: _isCorrect, ...option }) => option),
        }));
    // Redaction is mapping-time only: the persisted attempt keeps its real score.
    const resultAttempt = this.toAttempt(attempt);
    const resultAnswers = revealed
      ? answers
      : answers.map((answer) => ({ ...answer, isCorrect: null }));
    if (!revealed) resultAttempt.score = null;
    return {
      attempt: resultAttempt,
      test: { id: test.id, title: test.title, timeLimitMinutes: test.timeLimitMinutes },
      questions: resultQuestions,
      answers: resultAnswers,
      answersRevealed: revealed,
    };
  }

  private canManage(test: { authorId: number }, actor: Actor): boolean {
    return actor.role === 'admin' || test.authorId === actor.id;
  }

  private isRevealed(
    test: { authorId: number; showAnswersAfterCompletion: boolean },
    actor: Actor,
  ): boolean {
    return test.showAnswersAfterCompletion || this.canManage(test, actor);
  }

  private buildQuestionOrder(
    test: NonNullable<TestRow>,
    questions: QuestionWithOptions[],
  ): number[] | null {
    const ids = [...questions].sort((a, b) => a.orderIndex - b.orderIndex).map((q) => q.id);
    if (!test.shuffleQuestions) return ids;
    for (let i = ids.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    }
    return ids;
  }

  private grade(question: QuestionWithOptions, selectedIds: number[]): boolean | null {
    if (question.type === 'open_ended') return null;
    const correctIds = question.options
      .filter((option) => option.isCorrect)
      .map((option) => option.id);
    if (question.type === 'multiple_choice') {
      return (
        selectedIds.length > 0 &&
        selectedIds.length === correctIds.length &&
        selectedIds.every((id) => correctIds.includes(id))
      );
    }
    return selectedIds.length === 1 && correctIds.includes(selectedIds[0]!);
  }

  private isPastDeadline(
    attempt: { startedAt: Date },
    test: { timeLimitMinutes: number | null },
  ): boolean {
    if (test.timeLimitMinutes === null || test.timeLimitMinutes === undefined) return false;
    return Date.now() > new Date(attempt.startedAt).getTime() + test.timeLimitMinutes * 60_000;
  }

  private timeSpentSeconds(attempt: { startedAt: Date }, now: Date): number {
    return Math.max(0, Math.floor((now.getTime() - new Date(attempt.startedAt).getTime()) / 1000));
  }

  private toAttempt(attempt: AttemptRow): TestAttempt {
    return {
      id: attempt.id,
      userId: attempt.userId,
      testId: attempt.testId,
      status: attempt.status,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      score: attempt.score,
      timeSpentSeconds: attempt.timeSpentSeconds,
      questionOrder: attempt.questionOrder ?? null,
    };
  }
}
