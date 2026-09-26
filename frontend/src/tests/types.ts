import type { AnswerOption, Question, Test } from '@testopia/shared';

export type ApiTest = Omit<Test, 'availableFrom' | 'availableUntil' | 'createdAt' | 'updatedAt'> & {
  availableFrom: string | null;
  availableUntil: string | null;
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
