import { compare, hash } from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const MAX_BCRYPT_PASSWORD_BYTES = 72;

export class PasswordTooLongError extends Error {
  constructor() {
    super('Password must be at most 72 UTF-8 bytes');
    this.name = 'PasswordTooLongError';
  }
}

function passwordBytes(password: string): Uint8Array {
  return new TextEncoder().encode(password);
}

export function hashPassword(password: string): Promise<string> {
  if (passwordBytes(password).length > MAX_BCRYPT_PASSWORD_BYTES) {
    return Promise.reject(new PasswordTooLongError());
  }
  return hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  if (passwordBytes(password).length > MAX_BCRYPT_PASSWORD_BYTES) return Promise.resolve(false);
  return compare(password, passwordHash);
}
