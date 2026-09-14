import type { User } from '@practice-works/shared';

export interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface ApiErrorPayload {
  error?: string;
  message?: string;
  issues?: Array<{ path?: Array<string | number>; message?: string }>;
}

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
