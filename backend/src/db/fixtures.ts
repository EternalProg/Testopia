import type { CreateQuestionInput, CreateTestInput, RegisterInput } from '@practice-works/shared';

export const userFixture: RegisterInput = {
  email: 'fixture@example.com',
  username: 'fixture-user',
  password: 'fixture-password',
};

export const testFixture: CreateTestInput = {
  title: 'Fixture test',
  description: 'A test fixture for repository and integration tests',
  isPublished: true,
  shuffleQuestions: false,
  timeLimitMinutes: 15,
  showAnswersAfterCompletion: true,
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
