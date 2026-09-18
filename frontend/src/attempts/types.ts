import type {
  AttemptAnswer,
  AttemptHistoryItem,
  AttemptResult,
  AttemptTestInfo,
  PublicQuestion,
  ResultQuestion,
  TestAttempt,
} from '@testopia/shared';

export type ApiAttempt = Omit<TestAttempt, 'startedAt' | 'completedAt'> & {
  startedAt: string;
  completedAt: string | null;
};

export type ApiAttemptQuestion = PublicQuestion;

export type ApiResultQuestion = ResultQuestion;

export interface AttemptDetail {
  attempt: ApiAttempt;
  test: AttemptTestInfo;
  questions: ApiAttemptQuestion[];
}

export interface SubmitAttemptResult {
  attempt: ApiAttempt;
  answers: AttemptAnswer[];
  answersRevealed: boolean;
}

export type ApiAttemptResult = Omit<AttemptResult, 'attempt' | 'questions'> & {
  attempt: ApiAttempt;
  questions: ApiResultQuestion[];
};

export type ApiAttemptHistoryItem = Omit<AttemptHistoryItem, 'startedAt' | 'completedAt'> & {
  startedAt: string;
  completedAt: string | null;
};

export interface ExpiredSubmitBody {
  error?: string;
  message?: string;
  attempt: ApiAttempt;
  answers: AttemptAnswer[];
  answersRevealed: boolean;
}
