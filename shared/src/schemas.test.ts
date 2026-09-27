import { describe, expect, it } from 'vitest';

import {
  createQuestionSchema,
  createTestSchema,
  gradeAttemptSchema,
  loginSchema,
  paginationSchema,
  registerSchema,
  testListSortSchema,
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
      shuffleOptions: false,
      showAnswersAfterCompletion: true,
    });
    // Both nullable settings stay absent when the author leaves them empty.
    const parsed = createTestSchema.parse({ title: 'Algebra' });
    expect(parsed.maxAttempts).toBeUndefined();
    expect(parsed.questionCount).toBeUndefined();
  });

  it('bounds the attempt limit and question count', () => {
    expect(createTestSchema.safeParse({ title: 'Algebra', maxAttempts: 3 }).success).toBe(true);
    expect(createTestSchema.safeParse({ title: 'Algebra', maxAttempts: null }).success).toBe(true);
    expect(createTestSchema.safeParse({ title: 'Algebra', maxAttempts: 0 }).success).toBe(false);
    expect(createTestSchema.safeParse({ title: 'Algebra', maxAttempts: 1.5 }).success).toBe(false);
    // 100 caps how many attempts an author can mint per taker by design.
    expect(createTestSchema.safeParse({ title: 'Algebra', maxAttempts: 100 }).success).toBe(true);
    expect(createTestSchema.safeParse({ title: 'Algebra', maxAttempts: 101 }).success).toBe(false);

    expect(createTestSchema.safeParse({ title: 'Algebra', questionCount: 10 }).success).toBe(true);
    expect(createTestSchema.safeParse({ title: 'Algebra', questionCount: null }).success).toBe(
      true,
    );
    expect(createTestSchema.safeParse({ title: 'Algebra', questionCount: 0 }).success).toBe(false);
    // No upper bound: the service clamps to the question count.
    expect(createTestSchema.safeParse({ title: 'Algebra', questionCount: 5000 }).success).toBe(
      true,
    );
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

  it('parses the test list sort', () => {
    expect(testListSortSchema.parse('newest')).toBe('newest');
    expect(testListSortSchema.parse('popular')).toBe('popular');
    expect(testListSortSchema.parse('hardest')).toBe('hardest');
    expect(testListSortSchema.safeParse('random').success).toBe(false);
    expect(testListSortSchema.safeParse(undefined).success).toBe(false);
  });

  it('caps the test list page size at 100', () => {
    expect(paginationSchema.safeParse({ page: 1, pageSize: 200 }).success).toBe(false);
    expect(paginationSchema.safeParse({ page: 1, pageSize: 101 }).success).toBe(false);
    expect(paginationSchema.parse({ page: 1 }).pageSize).toBe(20);
  });
});
