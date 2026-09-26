import type {
  AttemptStatus,
  MyStatistics,
  MyTestStatItem,
  ScoreBucket,
  TestStats,
} from '@testopia/shared';

export type { ScoreBucket, TestStats };

export interface ApiQuestionStats {
  questionId: number;
  text: string;
  attempts: number;
  correctAnswers: number;
  correctnessRate: number | null;
}

export type ApiTestStats = Omit<TestStats, 'questionStats'> & {
  scoreDistribution: ScoreBucket[];
  questionStats: ApiQuestionStats[];
};

export type ApiMyTestStatItem = Omit<MyTestStatItem, 'lastTakenAt'> & {
  lastTakenAt: string | null;
  lastStatus: AttemptStatus | null;
};

export type ApiMyStatistics = Omit<MyStatistics, 'tests'> & {
  tests: ApiMyTestStatItem[];
};
