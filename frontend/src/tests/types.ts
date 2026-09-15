import type { AnswerOption, Question, Test } from '@practice-works/shared';

export type ApiTest = Omit<Test, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};
export type ApiQuestion = Omit<Question, 'options'> & {
  options: Array<Omit<AnswerOption, 'isCorrect'> & { isCorrect?: boolean }>;
};
export interface TestDetail {
  test: ApiTest;
  questions: ApiQuestion[];
}
export type TestListItem = ApiTest;
