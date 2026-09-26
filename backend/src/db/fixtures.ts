import type {
  CreateQuestionInput,
  CreateTestInput,
  RegisterInput,
  SubmitAnswerInput,
} from '@testopia/shared';

export const userFixture: RegisterInput = {
  email: 'fixture@example.com',
  username: 'fixture-user',
  password: 'fixture-password',
};

export const authorFixture: RegisterInput = {
  email: 'author-fixture@example.com',
  username: 'fixture-author',
  password: 'fixture-password',
};

export const takerFixture: RegisterInput = {
  email: 'taker-fixture@example.com',
  username: 'fixture-taker',
  password: 'fixture-password',
};

export const adminFixture: RegisterInput = {
  email: 'admin-fixture@example.com',
  username: 'fixture-admin',
  password: 'fixture-password',
};

export const testFixture: CreateTestInput = {
  title: 'Fixture test',
  description: 'A test fixture for repository and integration tests',
  isPublished: true,
  shuffleQuestions: false,
  timeLimitMinutes: 15,
  showAnswersAfterCompletion: true,
  showQuestionsBeforeStart: true,
  availableFrom: null,
  availableUntil: null,
};

export const draftTestFixture: CreateTestInput = {
  title: 'Draft fixture test',
  description: 'An unpublished fixture test',
  isPublished: false,
  shuffleQuestions: false,
  showAnswersAfterCompletion: true,
  showQuestionsBeforeStart: true,
  availableFrom: null,
  availableUntil: null,
};

export const publishedRevealedTestFixture: CreateTestInput = {
  title: 'Published revealed fixture test',
  description: 'A published fixture test with answers revealed after completion',
  isPublished: true,
  shuffleQuestions: false,
  timeLimitMinutes: 30,
  showAnswersAfterCompletion: true,
  showQuestionsBeforeStart: true,
  availableFrom: null,
  availableUntil: null,
};

export const publishedHiddenTestFixture: CreateTestInput = {
  title: 'Published hidden fixture test',
  description: 'A published fixture test with answers hidden after completion',
  isPublished: true,
  shuffleQuestions: false,
  timeLimitMinutes: 30,
  showAnswersAfterCompletion: false,
  showQuestionsBeforeStart: true,
  availableFrom: null,
  availableUntil: null,
};

export const questionFixture: CreateQuestionInput = {
  text: 'What is 2 + 2?',
  type: 'single_choice',
  orderIndex: 0,
  options: [
    { text: '4', isCorrect: true },
    { text: '5', isCorrect: false },
  ],
};

export const singleChoiceQuestionFixture: CreateQuestionInput = {
  text: 'What is 2 + 2?',
  type: 'single_choice',
  orderIndex: 0,
  options: [
    { text: '4', isCorrect: true },
    { text: '5', isCorrect: false },
  ],
};

export const multipleChoiceQuestionFixture: CreateQuestionInput = {
  text: 'Which numbers are even?',
  type: 'multiple_choice',
  orderIndex: 1,
  options: [
    { text: '2', isCorrect: true },
    { text: '4', isCorrect: true },
    { text: '3', isCorrect: false },
  ],
};

export const trueFalseQuestionFixture: CreateQuestionInput = {
  text: 'The sky is blue.',
  type: 'true_false',
  orderIndex: 2,
  options: [
    { text: 'True', isCorrect: true },
    { text: 'False', isCorrect: false },
  ],
};

export const openEndedQuestionFixture: CreateQuestionInput = {
  text: 'Explain why the sky is blue.',
  type: 'open_ended',
  orderIndex: 3,
};

/** Deterministic builders covering all four question types (orderIndex 0-3). */
export function allQuestionFixtures(): [
  CreateQuestionInput,
  CreateQuestionInput,
  CreateQuestionInput,
  CreateQuestionInput,
] {
  return [
    singleChoiceQuestionFixture,
    multipleChoiceQuestionFixture,
    trueFalseQuestionFixture,
    openEndedQuestionFixture,
  ];
}

export function submitAnswerFixture(
  questionId: number,
  selectedOptionIds: number[] = [],
  textAnswer: string | null = null,
): SubmitAnswerInput {
  return { questionId, selectedOptionIds, textAnswer };
}
