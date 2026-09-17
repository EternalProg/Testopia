import type { ScoreBucket, TestStats } from '@practice-works/shared';

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
