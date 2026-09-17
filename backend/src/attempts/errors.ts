export type AttemptErrorCode =
  'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION_ERROR' | 'EXPIRED';

export class AttemptError extends Error {
  constructor(
    message: string,
    readonly code: AttemptErrorCode,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AttemptError';
  }
}
