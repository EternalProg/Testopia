import { z } from 'zod';

import {
  attemptStatuses,
  difficulties,
  questionTypes,
  testCategories,
  userRoles,
} from './domain.js';

export const userRoleSchema = z.enum(userRoles);
export const questionTypeSchema = z.enum(questionTypes);
export const attemptStatusSchema = z.enum(attemptStatuses);
export const testCategorySchema = z.enum(testCategories);
export const difficultySchema = z.enum(difficulties);

export const registerSchema = z.object({
  email: z.string().trim().email(),
  username: z.string().trim().min(2).max(100),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

const baseTestSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10_000).nullable().optional(),
  isPublished: z.boolean().default(false),
  category: testCategorySchema.nullable().optional(),
  difficulty: difficultySchema.nullable().optional(),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  // Empty (null) means unlimited attempts. The 100 cap bounds the number of
  // attempts an author can mint per taker by design.
  maxAttempts: z.number().int().min(1).max(100).nullable().optional(),
  // Empty (null) asks every question; the service clamps values above the
  // question count down to the bank size.
  questionCount: z.number().int().min(1).nullable().optional(),
  timeLimitMinutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .nullable()
    .optional(),
  showAnswersAfterCompletion: z.boolean().default(true),
  showQuestionsBeforeStart: z.boolean().default(true),
  // ISO datetime strings (UTC) to stay representable in OpenAPI JSON Schema
  // (z.coerce.date() breaks z.toJSONSchema). The service coerces to Date.
  availableFrom: z.iso.datetime().nullable().optional(),
  availableUntil: z.iso.datetime().nullable().optional(),
});

function checkAvailabilityWindow(
  test: { availableFrom?: string | null | undefined; availableUntil?: string | null | undefined },
  context: { addIssue: (issue: { code: 'custom'; path: string[]; message: string }) => void },
) {
  if (typeof test.availableFrom === 'string' && typeof test.availableUntil === 'string') {
    const from = new Date(test.availableFrom).getTime();
    const until = new Date(test.availableUntil).getTime();
    if (!Number.isNaN(from) && !Number.isNaN(until) && from >= until) {
      context.addIssue({
        code: 'custom',
        path: ['availableUntil'],
        message: 'Closing time must be after opening time',
      });
    }
  }
}

export const createTestSchema = baseTestSchema.superRefine(checkAvailabilityWindow);

export const updateTestSchema = baseTestSchema.partial().superRefine(checkAvailabilityWindow);

const answerOptionSchema = z.object({
  text: z.string().trim().min(1).max(500),
  isCorrect: z.boolean().default(false),
});

export const createQuestionSchema = z
  .object({
    text: z.string().trim().min(1).max(10_000),
    type: questionTypeSchema,
    orderIndex: z.number().int().min(0),
    options: z.array(answerOptionSchema).max(100).optional(),
  })
  .superRefine((question, context) => {
    const requiresOptions =
      question.type === 'single_choice' ||
      question.type === 'multiple_choice' ||
      question.type === 'true_false';

    if (
      requiresOptions &&
      (!question.options ||
        (question.type === 'true_false'
          ? question.options.length !== 2
          : question.options.length < 2))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message:
          question.type === 'true_false'
            ? 'True/False questions require exactly two answer options'
            : 'Choice questions require at least two answer options',
      });
    }

    if (!requiresOptions && question.options && question.options.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Only choice questions can have answer options',
      });
    }
  });

export const updateQuestionSchema = z.object({
  text: z.string().trim().min(1).max(10_000).optional(),
  type: questionTypeSchema.optional(),
  orderIndex: z.number().int().min(0).optional(),
  options: z.array(answerOptionSchema).max(100).optional(),
});

export const submitAnswerSchema = z.object({
  questionId: z.number().int().positive(),
  selectedOptionIds: z.array(z.number().int().positive()).max(100).default([]),
  textAnswer: z.string().max(10_000).nullable().optional(),
});

export const submitAttemptSchema = z
  .object({
    answers: z.array(submitAnswerSchema).max(500),
  })
  .superRefine((attempt, context) => {
    const seen = new Set<number>();
    for (const answer of attempt.answers) {
      if (seen.has(answer.questionId)) {
        context.addIssue({
          code: 'custom',
          path: ['answers'],
          message: 'Each question may be answered only once',
        });
        return;
      }
      seen.add(answer.questionId);
    }
  });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Browse ordering for GET /api/v1/tests: newest keeps the current
// createdAt DESC default; popular ranks by attempt count DESC; hardest
// ranks by lowest average terminal score first (tests without terminal
// scores sort last).
export const testListSorts = ['newest', 'popular', 'hardest'] as const;

export const testListSortSchema = z.enum(testListSorts);

// Opt-in envelope for GET /api/v1/tests: only returned when ?page= is
// present; otherwise the endpoint keeps returning the legacy bare array.
export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

const gradeEntrySchema = z.object({
  questionId: z.number().int().positive(),
  isCorrect: z.boolean(),
});

export const gradeAttemptSchema = z
  .object({
    grades: z.array(gradeEntrySchema).min(1).max(500),
  })
  .superRefine((attempt, context) => {
    const seen = new Set<number>();
    for (const grade of attempt.grades) {
      if (seen.has(grade.questionId)) {
        context.addIssue({
          code: 'custom',
          path: ['grades'],
          message: 'Each question may be graded only once',
        });
        return;
      }
      seen.add(grade.questionId);
    }
  });

// Taker-facing aggregate over every test the user attempted. String dates
// keep the payload representable in OpenAPI JSON Schema
// (z.coerce.date() breaks z.toJSONSchema).
export const myTestStatItemSchema = z.object({
  testId: z.number().int().positive(),
  title: z.string(),
  attempts: z.number().int().min(0),
  bestScore: z.number().min(0).max(1).nullable(),
  lastScore: z.number().min(0).max(1).nullable(),
  lastTakenAt: z.iso.datetime().nullable(),
  lastStatus: attemptStatusSchema.nullable(),
});

export const myStatisticsSchema = z.object({
  testsTaken: z.number().int().min(0),
  totalAttempts: z.number().int().min(0),
  completedAttempts: z.number().int().min(0),
  passRate: z.number().min(0).max(1).nullable(),
  averageScore: z.number().min(0).max(1).nullable(),
  averageAttemptsPerTest: z.number().min(0).nullable(),
  bestScore: z.number().min(0).max(1).nullable(),
  tests: z.array(myTestStatItemSchema),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateTestInput = z.infer<typeof createTestSchema>;
export type UpdateTestInput = z.infer<typeof updateTestSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;
export type GradeAttemptInput = z.infer<typeof gradeAttemptSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type TestListSort = z.infer<typeof testListSortSchema>;
export type MyTestStatItemInput = z.infer<typeof myTestStatItemSchema>;
export type MyStatisticsInput = z.infer<typeof myStatisticsSchema>;

export { userRoles };
