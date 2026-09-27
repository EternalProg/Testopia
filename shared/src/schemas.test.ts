import { describe, expect, it } from 'vitest';

import {
  createQuestionSchema,
  createTestSchema,
  gradeAttemptSchema,
  loginSchema,
  paginationSchema,
  registerSchema,
} from './schemas.js';

describe('shared schemas', () => {
  it('validates registration and login inputs', () => {
    expect(
      registerSchema.safeParse({
        email: 'person@example.com',
        username: 'person',
        password: 'password123',
      }).success,
    ).toBe(true);
    expect(loginSchema.safeParse({ email: 'invalid', password: '' }).success).toBe(false);
  });

  it('applies test defaults', () => {
    expect(createTestSchema.parse({ title: 'Algebra' })).toMatchObject({
      isPublished: false,
      shuffleQuestions: false,
      showAnswersAfterCompletion: true,
    });
  });

  it('requires options only for choice questions', () => {
    expect(
      createQuestionSchema.safeParse({
        text: 'Choose the answer',
        type: 'single_choice',
        orderIndex: 0,
        options: [
          { text: 'Correct', isCorrect: true },
          { text: 'Incorrect', isCorrect: false },
        ],
      }).success,
    ).toBe(true);

    expect(
      createQuestionSchema.safeParse({
        text: 'Explain the answer',
        type: 'open_ended',
        orderIndex: 0,
        options: [{ text: 'Not allowed', isCorrect: false }],
      }).success,
    ).toBe(false);
  });

  it('validates manual grading payloads', () => {
    expect(
      gradeAttemptSchema.safeParse({ grades: [{ questionId: 1, isCorrect: true }] }).success,
    ).toBe(true);
    expect(gradeAttemptSchema.safeParse({ grades: [] }).success).toBe(false);
    expect(
      gradeAttemptSchema.safeParse({
        grades: [
          { questionId: 1, isCorrect: true },
          { questionId: 1, isCorrect: false },
        ],
      }).success,
    ).toBe(false);
    expect(
      gradeAttemptSchema.safeParse({ grades: [{ questionId: 1, isCorrect: 'yes' }] }).success,
    ).toBe(false);
    expect(
      gradeAttemptSchema.safeParse({ grades: [{ questionId: 0, isCorrect: true }] }).success,
    ).toBe(false);
  });

  it('coerces and bounds pagination', () => {
    expect(paginationSchema.parse({ page: '2', pageSize: '50' })).toEqual({
      page: 2,
      pageSize: 50,
    });
    expect(paginationSchema.safeParse({ page: 0 }).success).toBe(false);
  });
});
