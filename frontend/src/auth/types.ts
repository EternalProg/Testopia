import type { User } from '@testopia/shared';

export interface Session {
  user: User;
  accessToken: string;
  refreshTokenExpiresAt: string;
}

export interface ApiErrorPayload {
  error?: string;
  message?: string;
  issues?: Array<{ path?: Array<string | number>; message?: string }>;
}

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
