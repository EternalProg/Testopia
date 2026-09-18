import { createQuestionSchema, createTestSchema, registerSchema } from '@practice-works/shared';
import { describe, expect, it } from 'vitest';

import {
  adminFixture,
  allQuestionFixtures,
  authorFixture,
  draftTestFixture,
  multipleChoiceQuestionFixture,
  openEndedQuestionFixture,
  publishedHiddenTestFixture,
  publishedRevealedTestFixture,
  questionFixture,
  singleChoiceQuestionFixture,
  submitAnswerFixture,
  takerFixture,
  testFixture,
  trueFalseQuestionFixture,
  userFixture,
} from './fixtures.js';

describe('database fixtures', () => {
  it('contains valid values for the shared contracts', () => {
    expect(userFixture.email).toContain('@');
    expect(testFixture.isPublished).toBe(true);
    expect(questionFixture.options).toHaveLength(2);
  });

  it('provides deterministic role fixtures validating against the register schema', () => {
    for (const fixture of [authorFixture, takerFixture, adminFixture, userFixture]) {
      expect(registerSchema.safeParse(fixture).success).toBe(true);
    }
    const emails = new Set(
      [authorFixture, takerFixture, adminFixture].map((fixture) => fixture.email),
    );
    expect(emails.size).toBe(3);
  });

  it('provides draft and revealed/hidden published test fixtures', () => {
    for (const fixture of [
      draftTestFixture,
      publishedRevealedTestFixture,
      publishedHiddenTestFixture,
    ]) {
      expect(createTestSchema.safeParse(fixture).success).toBe(true);
    }
    expect(draftTestFixture.isPublished).toBe(false);
    expect(publishedRevealedTestFixture.showAnswersAfterCompletion).toBe(true);
    expect(publishedHiddenTestFixture.showAnswersAfterCompletion).toBe(false);
  });

  it('covers all four question types with service-valid correctness rules', () => {
    const fixtures = allQuestionFixtures();
    expect(fixtures).toHaveLength(4);
    expect(fixtures.map((fixture) => fixture.type)).toEqual([
      'single_choice',
      'multiple_choice',
      'true_false',
      'open_ended',
    ]);
    expect(fixtures.map((fixture) => fixture.orderIndex)).toEqual([0, 1, 2, 3]);
    for (const fixture of fixtures) {
      expect(createQuestionSchema.safeParse(fixture).success).toBe(true);
    }

    const singleCorrect =
      singleChoiceQuestionFixture.options?.filter((option) => option.isCorrect) ?? [];
    expect(singleChoiceQuestionFixture.options?.length).toBeGreaterThanOrEqual(2);
    expect(singleCorrect).toHaveLength(1);

    const multiCorrect =
      multipleChoiceQuestionFixture.options?.filter((option) => option.isCorrect) ?? [];
    expect(multipleChoiceQuestionFixture.options?.length).toBeGreaterThanOrEqual(2);
    expect(multiCorrect.length).toBeGreaterThanOrEqual(1);

    expect(trueFalseQuestionFixture.options).toHaveLength(2);
    expect(trueFalseQuestionFixture.options?.filter((option) => option.isCorrect)).toHaveLength(1);

    expect(openEndedQuestionFixture.options).toBeUndefined();
  });

  it('builds deterministic submit answers and stays stable across calls', () => {
    expect(allQuestionFixtures()).toEqual(allQuestionFixtures());
    expect(submitAnswerFixture(7, [11, 12], null)).toEqual({
      questionId: 7,
      selectedOptionIds: [11, 12],
      textAnswer: null,
    });
    expect(submitAnswerFixture(9, [], 'free text')).toEqual({
      questionId: 9,
      selectedOptionIds: [],
      textAnswer: 'free text',
    });
  });
});
