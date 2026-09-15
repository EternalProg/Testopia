export const userRoles = ['user', 'admin'] as const;
export type UserRole = (typeof userRoles)[number];

export const questionTypes = [
  'single_choice',
  'multiple_choice',
  'open_ended',
  'true_false',
] as const;
export type QuestionType = (typeof questionTypes)[number];

export const attemptStatuses = ['in_progress', 'completed', 'expired'] as const;
export type AttemptStatus = (typeof attemptStatuses)[number];

export interface User {
  id: number;
  email: string;
  username: string;
  role: UserRole;
  createdAt: Date;
}

export interface AnswerOption {
  id: number;
  questionId: number;
  text: string;
  isCorrect: boolean;
}

export interface Question {
  id: number;
  testId: number;
  text: string;
  type: QuestionType;
  orderIndex: number;
  options: AnswerOption[];
}

export type PublicAnswerOption = Omit<AnswerOption, 'isCorrect'>;
export type PublicQuestion = Omit<Question, 'options'> & { options: PublicAnswerOption[] };

export interface Test {
  id: number;
  title: string;
  description: string | null;
  authorId: number;
  isPublished: boolean;
  shuffleQuestions: boolean;
  timeLimitMinutes: number | null;
  showAnswersAfterCompletion: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestAttempt {
  id: number;
  userId: number;
  testId: number;
  status: AttemptStatus;
  startedAt: Date;
  completedAt: Date | null;
  score: number | null;
  timeSpentSeconds: number | null;
}

export interface QuestionStats {
  questionId: number;
  attempts: number;
  correctAnswers: number;
  correctnessRate: number;
}

export interface TestStats {
  testId: number;
  attemptsCount: number;
  completedAttemptsCount: number;
  averageScore: number | null;
  averageTimeSeconds: number | null;
  questionStats: QuestionStats[];
}
