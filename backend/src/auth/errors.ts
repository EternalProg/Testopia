export class AuthError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'INVALID_CREDENTIALS'
      | 'EMAIL_TAKEN'
      | 'INVALID_REFRESH_TOKEN'
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'PASSWORD_TOO_LONG',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
