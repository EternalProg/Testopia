import {
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

export const userRoleEnum = mysqlEnum('role', ['user', 'admin']);
export const questionTypeEnum = mysqlEnum('type', [
  'single_choice',
  'multiple_choice',
  'open_ended',
  'true_false',
]);
export const attemptStatusEnum = mysqlEnum('status', ['in_progress', 'completed', 'expired']);

export const users = mysqlTable(
  'users',
  {
    id: int('id').autoincrement().primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    username: varchar('username', { length: 100 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    role: userRoleEnum.notNull().default('user'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

export const refreshTokens = mysqlTable(
  'refresh_tokens',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    replacedByTokenId: varchar('replaced_by_token_id', { length: 36 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('refresh_tokens_hash_unique').on(table.tokenHash),
    index('refresh_tokens_user_id_idx').on(table.userId),
    index('refresh_tokens_expires_at_idx').on(table.expiresAt),
  ],
);

export const tests = mysqlTable(
  'tests',
  {
    id: int('id').autoincrement().primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    authorId: int('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    isPublished: boolean('is_published').notNull().default(false),
    shuffleQuestions: boolean('shuffle_questions').notNull().default(false),
    timeLimitMinutes: int('time_limit_minutes'),
    showAnswersAfterCompletion: boolean('show_answers_after_completion').notNull().default(true),
    showQuestionsBeforeStart: boolean('show_questions_before_start').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  },
  (table) => [index('tests_author_id_idx').on(table.authorId)],
);

export const questions = mysqlTable(
  'questions',
  {
    id: int('id').autoincrement().primaryKey(),
    testId: int('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    text: text('text').notNull(),
    type: questionTypeEnum.notNull(),
    orderIndex: int('order_index').notNull(),
  },
  (table) => [
    index('questions_test_id_idx').on(table.testId),
    uniqueIndex('questions_test_order_unique').on(table.testId, table.orderIndex),
  ],
);

export const answerOptions = mysqlTable(
  'answer_options',
  {
    id: int('id').autoincrement().primaryKey(),
    questionId: int('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    text: varchar('text', { length: 500 }).notNull(),
    isCorrect: boolean('is_correct').notNull().default(false),
  },
  (table) => [index('answer_options_question_id_idx').on(table.questionId)],
);

export const testAttempts = mysqlTable(
  'test_attempts',
  {
    id: int('id').autoincrement().primaryKey(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    testId: int('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    status: attemptStatusEnum.notNull().default('in_progress'),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
    score: decimal('score', { precision: 5, scale: 2, mode: 'number' }),
    timeSpentSeconds: int('time_spent_seconds'),
    // Persisted display order of question ids for this attempt. Shuffled when
    // tests.shuffle_questions is true, otherwise natural orderIndex order.
    // Older rows may be null; readers fall back to orderIndex order.
    questionOrder: json('question_order').$type<number[]>(),
  },
  (table) => [
    index('test_attempts_user_id_idx').on(table.userId),
    index('test_attempts_test_id_idx').on(table.testId),
    index('test_attempts_status_idx').on(table.status),
  ],
);

// NOTE: answer_records.selected_option_id stores a single option id while the
// shared submitAnswerSchema.selectedOptionIds is an array. Multiple-choice
// answers are persisted as one row per selected option id (each row carries the
// same per-question isCorrect verdict, so consumers must dedupe by question).
// Open-ended answers use a single row with text_answer and isCorrect null.
export const answerRecords = mysqlTable(
  'answer_records',
  {
    id: int('id').autoincrement().primaryKey(),
    attemptId: int('attempt_id')
      .notNull()
      .references(() => testAttempts.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    questionId: int('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    selectedOptionId: int('selected_option_id').references(() => answerOptions.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    textAnswer: text('text_answer'),
    isCorrect: boolean('is_correct'),
  },
  (table) => [
    index('answer_records_attempt_id_idx').on(table.attemptId),
    index('answer_records_question_id_idx').on(table.questionId),
  ],
);

export const schema = {
  users,
  tests,
  questions,
  answerOptions,
  testAttempts,
  answerRecords,
  refreshTokens,
};
