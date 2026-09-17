export type StatisticsErrorCode = 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION_ERROR';

export class StatisticsError extends Error {
  constructor(
    message: string,
    readonly code: StatisticsErrorCode,
  ) {
    super(message);
    this.name = 'StatisticsError';
  }
}
