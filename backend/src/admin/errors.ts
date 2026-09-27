export type AdminErrorCode = 'NOT_FOUND' | 'FORBIDDEN' | 'VALIDATION_ERROR';

export class AdminError extends Error {
  constructor(
    message: string,
    readonly code: AdminErrorCode,
  ) {
    super(message);
    this.name = 'AdminError';
  }
}
