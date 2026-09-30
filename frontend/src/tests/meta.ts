import { difficulties, testCategories } from '@testopia/shared';
import type { Difficulty, TestCategory } from '@testopia/shared';

export { difficulties, testCategories };

export const categoryLabels: Record<TestCategory, string> = {
  c: 'C',
  cpp: 'C++',
  java: 'Java',
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  go: 'Go',
  rust: 'Rust',
  sql: 'SQL',
  math: 'Математика',
  physics: 'Фізика',
  other: 'Інше',
};

export const difficultyLabels: Record<Difficulty, string> = {
  easy: 'Легко',
  medium: 'Середньо',
  hard: 'Складно',
};
