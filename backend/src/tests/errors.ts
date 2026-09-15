export type TestErrorCode = 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION_ERROR';

export class TestError extends Error {
  constructor(
    message: string,
    readonly code: TestErrorCode,
  ) {
    super(message);
    this.name = 'TestError';
  }
}
