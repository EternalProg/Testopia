export type AttemptErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'EXPIRED'
  | 'TEST_NOT_OPEN'
  | 'TEST_CLOSED'
  | 'ATTEMPT_LIMIT';

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
