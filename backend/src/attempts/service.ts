import type {
  AttemptAnswer,
  AttemptDetail,
  AttemptHistoryItem,
  AttemptResult,
  GradeAttemptInput,
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

/**
 * Mean over all non-null per-question credits (choice fractional credits and
 * graded open-ended 0/1), rounded to 2 decimals. Null when nothing is graded
 * yet (e.g. an attempt with only ungraded open-ended answers).
 */
export function scoreOf(verdicts: Array<number | null>): number | null {
  const credits = verdicts.filter((verdict): verdict is number => verdict !== null);
  if (credits.length === 0) return null;
  return (
    Math.round((credits.reduce((sum, credit) => sum + credit, 0) / credits.length) * 100) / 100
  );
}

/**
 * Turns the stored `option_order` JSON into a `Map<number, number[]>`. MySQL
 * returns JSON object keys as strings, so a stored `{ "11": [3, 4] }` becomes
 * `Map<11, [3, 4]>`; the caller then decides whether the entry is usable.
 * Malformed values (non-object, non-numeric key, non-integer-id array) are
 * dropped rather than trusted — the question falls back to natural order.
 */
export function normalizeOptionOrder(value: unknown): Map<number, number[]> {
  const normalized = new Map<number, number[]>();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return normalized;
  for (const [key, order] of Object.entries(value)) {
    const questionId = Number(key);
    if (!Number.isSafeInteger(questionId) || questionId <= 0) continue;
    if (!Array.isArray(order)) continue;
    if (!order.every((id) => typeof id === 'number' && Number.isSafeInteger(id))) continue;
    normalized.set(questionId, order as number[]);
  }
  return normalized;
}

/** True when `order` lists exactly the given option ids, once each. */
export function isPermutation(order: number[], ids: number[]): boolean {
  if (order.length !== ids.length) return false;
  const remaining = new Set(ids);
  return order.every((id) => {
    if (!remaining.has(id)) return false;
    remaining.delete(id);
    return true;
  });
}

export class AttemptsService {
  constructor(
    private readonly tests: TestsRepository,
    private readonly attempts: AttemptsRepository,
  ) {}

  async start(actor: Actor, testId: number): Promise<AttemptDetail> {
    const test = await this.requirePublishedTest(testId);
    const now = new Date();
    const active = await this.attempts.findActiveAttempt(actor.id, testId);
    if (active) {
      const pastDeadline = this.isPastDeadline(active, test);
      // Resume is allowed only while the window is still open for taking:
      // past the close the active attempt is force-expired with empty
      // records (score null), mirroring the start-time timeout path.
      const closed = this.isAfterClose(test, now);
      if (pastDeadline || closed) {
        // A null result means a concurrent submit already finished the
        // attempt; either way it is terminal, so fall through and start fresh
        // unless the window itself is closed.
        await this.attempts.completeAttempt(
          active.id,
          {
            status: 'expired',
            score: null,
            timeSpentSeconds: this.timeSpentSeconds(active, now),
            completedAt: now,
          },
          [],
        );
        if (closed) throw new AttemptError('This test is closed', 'TEST_CLOSED');
      } else {
        return this.detail(active);
      }
    }
    if (this.isBeforeOpen(test, now)) {
      throw new AttemptError("This test hasn't opened yet", 'TEST_NOT_OPEN');
    }
    if (this.isAfterClose(test, now)) {
      throw new AttemptError('This test is closed', 'TEST_CLOSED');
    }
    await this.assertWithinAttemptLimit(actor, test);
    const questions = await this.tests.findQuestions(testId);
    const created = await this.attempts.createAttempt({
      userId: actor.id,
      testId,
      questionOrder: this.buildQuestionOrder(test, questions),
      optionOrder: this.buildOptionOrder(test, questions),
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
    const credits: Array<number | null> = [];
    for (const question of questions) {
      const answer = submitted.get(question.id);
      const selectedIds = answer?.selectedOptionIds ?? [];
      const textAnswer = answer?.textAnswer ?? null;
      const credit = this.grade(question, selectedIds);
      credits.push(credit);
      // Persisted and exposed verdicts stay boolean (the answer_records
      // column and the shared AttemptAnswer contract are boolean): only full
      // credit counts as correct, while the fractional credit feeds the score.
      const isCorrect = credit === null ? null : credit === 1;
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

    const score = scoreOf(credits);
    const completedAt = new Date();
    // Force-expire on submit past the close: grade what was submitted but
    // mark it expired, reusing the 410 EXPIRED-with-result flow.
    const closed = this.isAfterClose(test, completedAt);
    const pastDeadline = this.isPastDeadline({ startedAt: attempt.startedAt }, test);
    const status = pastDeadline || closed ? 'expired' : 'completed';
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
      throw new AttemptError(
        closed ? 'This test is closed' : 'Time limit exceeded',
        'EXPIRED',
        result,
      );
    }
    return result;
  }

  /**
   * Answers for manual grading: author-or-admin of the test only (unlike
   * result reads, the attempt owner has no access here). Always revealed —
   * managers see real scores and verdicts.
   */
  async getGradeView(attemptId: number, actor: Actor): Promise<AttemptResult> {
    const { attempt, test } = await this.requireGradeableAttempt(attemptId, actor);
    const questions = await this.tests.findQuestions(test.id);
    const records = await this.attempts.findAnswerRecords(attempt.id);
    const answers = this.reconstructAnswers(questions, attempt, records);
    return this.toResult(attempt, test, questions, answers, true);
  }

  /**
   * Grades open-ended answers of a terminal attempt. Only open-ended
   * questions are gradable — choice verdicts are machine truth and immutable
   * (re-grading an already-graded open-ended answer overwrites its verdict
   * idempotently). The score is recomputed as the mean over all non-null
   * terminal verdicts: recomputed fractional choice credits plus the graded
   * open-ended 0/1 credits.
   */
  async gradeAttempt(
    actor: Actor,
    attemptId: number,
    input: GradeAttemptInput,
  ): Promise<{ attempt: TestAttempt }> {
    const { attempt, test } = await this.requireGradeableAttempt(attemptId, actor);
    const questions = await this.tests.findQuestions(test.id);
    const byId = new Map(questions.map((question) => [question.id, question]));
    for (const entry of input.grades) {
      const question = byId.get(entry.questionId);
      if (!question) {
        throw new AttemptError(
          `Question ${entry.questionId} does not belong to this test`,
          'VALIDATION_ERROR',
        );
      }
      if (question.type !== 'open_ended') {
        throw new AttemptError(
          `Question ${entry.questionId} is graded automatically and cannot be graded manually`,
          'VALIDATION_ERROR',
        );
      }
    }
    const records = await this.attempts.findAnswerRecords(attempt.id);
    const byQuestion = new Map<number, AnswerRecordRow[]>();
    for (const record of records) {
      const group = byQuestion.get(record.questionId);
      if (group) group.push(record);
      else byQuestion.set(record.questionId, [record]);
    }
    const overrides = new Map(input.grades.map((entry) => [entry.questionId, entry.isCorrect]));
    const credits: Array<number | null> = [];
    for (const question of questions) {
      if (question.type === 'open_ended') {
        const override = overrides.get(question.id);
        if (override !== undefined) {
          credits.push(override ? 1 : 0);
        } else {
          const current = byQuestion.get(question.id)?.[0]?.isCorrect ?? null;
          credits.push(current === null ? null : current ? 1 : 0);
        }
      } else {
        const rows = byQuestion.get(question.id) ?? [];
        const selectedIds = [
          ...new Set(
            rows.map((row) => row.selectedOptionId).filter((id): id is number => id !== null),
          ),
        ];
        credits.push(this.grade(question, selectedIds));
      }
    }
    const updated = await this.attempts.updateAnswerVerdicts(
      attempt.id,
      input.grades.map((entry) => ({ questionId: entry.questionId, isCorrect: entry.isCorrect })),
      scoreOf(credits),
    );
    if (!updated) throw new AttemptError('Attempt not found', 'NOT_FOUND');
    return { attempt: this.toAttempt(updated) };
  }

  private async requireGradeableAttempt(
    attemptId: number,
    actor: Actor,
  ): Promise<{ attempt: AttemptRow; test: NonNullable<TestRow> }> {
    const attempt = await this.attempts.findAttemptById(attemptId);
    if (!attempt) throw new AttemptError('Attempt not found', 'NOT_FOUND');
    const test = await this.tests.findById(attempt.testId);
    if (!test) throw new AttemptError('Test not found', 'NOT_FOUND');
    if (!this.canManage(test, actor)) {
      throw new AttemptError('Insufficient permissions', 'FORBIDDEN');
    }
    if (attempt.status !== 'completed' && attempt.status !== 'expired') {
      throw new AttemptError('Attempt is not finished', 'CONFLICT');
    }
    return { attempt, test };
  }

  private async requirePublishedTest(id: number): Promise<NonNullable<TestRow>> {
    const test = await this.tests.findById(id);
    if (!test || !test.isPublished) throw new AttemptError('Test not found', 'NOT_FOUND');
    return test;
  }

  /**
   * Refuses a fresh attempt once the taker used the whole budget. The check
   * is best-effort under a concurrent double-start: two simultaneous requests
   * can both read the same terminal count and each insert an attempt. The
   * same race already exists in the active-attempt lookup above, and closing
   * it would mean a row lock on every start, so it is documented instead.
   */
  private async assertWithinAttemptLimit(actor: Actor, test: NonNullable<TestRow>): Promise<void> {
    if (test.maxAttempts === null || test.maxAttempts === undefined) return;
    const used = await this.attempts.countTerminalByUser(actor.id, test.id);
    if (used >= test.maxAttempts) {
      throw new AttemptError(
        `Attempt limit reached (${used} of ${test.maxAttempts} used)`,
        'ATTEMPT_LIMIT',
      );
    }
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
    const ordered =
      !order || !order.length
        ? [...questions].sort((a, b) => a.orderIndex - b.orderIndex)
        : this.questionsInOrder(questions, order);
    return this.withOptionOrder(ordered, normalizeOptionOrder(attempt.optionOrder));
  }

  private questionsInOrder(
    questions: QuestionWithOptions[],
    order: number[],
  ): QuestionWithOptions[] {
    const byId = new Map(questions.map((question) => [question.id, question]));
    const ordered = order
      .map((id) => byId.get(id))
      .filter((question): question is QuestionWithOptions => !!question);
    for (const question of questions) {
      if (!order.includes(question.id)) ordered.push(question);
    }
    return ordered;
  }

  /**
   * Applies the attempt's stored option order. An entry is honored only when
   * it is an exact permutation of the question's current option ids: authors
   * can add or remove options mid-attempt, and a stale order would otherwise
   * drop or duplicate choices. Open-ended questions (no options) fall out
   * naturally because their stored array is empty.
   */
  private withOptionOrder(
    questions: QuestionWithOptions[],
    optionOrder: Map<number, number[]>,
  ): QuestionWithOptions[] {
    if (optionOrder.size === 0) return questions;
    return questions.map((question) => {
      const order = optionOrder.get(question.id);
      if (
        !order ||
        !isPermutation(
          order,
          question.options.map((option) => option.id),
        )
      ) {
        return question;
      }
      const byId = new Map(question.options.map((option) => [option.id, option]));
      return { ...question, options: order.map((id) => byId.get(id)!) };
    });
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

  /**
   * Per-attempt option display order, or null when the test does not shuffle
   * options. Open-ended questions get an entry too (an empty array): keeping
   * the key set stable means a later type change still round-trips through
   * the same normalization path.
   */
  private buildOptionOrder(
    test: NonNullable<TestRow>,
    questions: QuestionWithOptions[],
  ): Record<number, number[]> | null {
    if (!test.shuffleOptions) return null;
    const order: Record<number, number[]> = {};
    for (const question of questions) {
      const ids = question.options.map((option) => option.id);
      for (let i = ids.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j]!, ids[i]!];
      }
      order[question.id] = ids;
    }
    return order;
  }

  /**
   * Per-question credit in [0, 1] (null for open-ended, graded manually).
   * Single-choice and true/false stay all-or-nothing; multiple-choice earns
   * proportional credit: (correctSelected − wrongSelected) / correctCount,
   * clamped at 0. Callers map full credit (1) to a `true` verdict; anything
   * less is stored and exposed as `false` while still contributing to the
   * score through {@link scoreOf}.
   */
  private grade(question: QuestionWithOptions, selectedIds: number[]): number | null {
    if (question.type === 'open_ended') return null;
    const correctIds = question.options
      .filter((option) => option.isCorrect)
      .map((option) => option.id);
    if (question.type === 'multiple_choice') {
      if (selectedIds.length === 0 || correctIds.length === 0) return 0;
      const correctSelected = selectedIds.filter((id) => correctIds.includes(id)).length;
      const wrongSelected = selectedIds.length - correctSelected;
      const credit = (correctSelected - wrongSelected) / correctIds.length;
      return Math.round(Math.max(0, credit) * 100) / 100;
    }
    return selectedIds.length === 1 && correctIds.includes(selectedIds[0]!) ? 1 : 0;
  }

  private isPastDeadline(
    attempt: { startedAt: Date },
    test: { timeLimitMinutes: number | null },
  ): boolean {
    if (test.timeLimitMinutes === null || test.timeLimitMinutes === undefined) return false;
    return Date.now() > new Date(attempt.startedAt).getTime() + test.timeLimitMinutes * 60_000;
  }

  private isBeforeOpen(test: { availableFrom: Date | null }, now: Date = new Date()): boolean {
    if (test.availableFrom === null || test.availableFrom === undefined) return false;
    return now.getTime() < new Date(test.availableFrom).getTime();
  }

  private isAfterClose(test: { availableUntil: Date | null }, now: Date = new Date()): boolean {
    if (test.availableUntil === null || test.availableUntil === undefined) return false;
    return now.getTime() > new Date(test.availableUntil).getTime();
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
