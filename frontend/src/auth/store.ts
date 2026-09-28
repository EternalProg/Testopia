import type { LoginInput, RegisterInput, User } from '@testopia/shared';
import { create } from 'zustand';

import { ApiError, authApi } from './api.js';
import type { AuthStatus } from './types.js';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  error: string | null;
  initialize: () => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.payload.message ?? error.payload.error ?? error.message;
  }
  return 'Something went wrong. Please try again.';
}

let initializePromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  user: null,
  error: null,
  initialize: async () => {
    if (initializePromise) return initializePromise;
    if (get().status === 'authenticated') return;

    // No stored-token gate: the refresh session lives in an httpOnly cookie
    // the page cannot read, so bootstrap always attempts a refresh and treats
    // 401 as "no session".
    initializePromise = (async () => {
      set({ status: 'loading', error: null });
      try {
        await authApi.refresh();
        const user = await authApi.me();
        set({ status: 'authenticated', user, error: null });
      } catch {
        authApi.clearAccessToken();
        set({ status: 'unauthenticated', user: null });
      }
    })();

    try {
      await initializePromise;
    } finally {
      initializePromise = null;
    }
  },
  register: async (input) => {
    set({ status: 'loading', error: null });
    try {
      const session = await authApi.register(input);
      set({ status: 'authenticated', user: session.user, error: null });
    } catch (error) {
      set({ status: 'unauthenticated', error: errorMessage(error) });
      throw error;
    }
  },
  login: async (input) => {
    set({ status: 'loading', error: null });
    try {
      const session = await authApi.login(input);
      set({ status: 'authenticated', user: session.user, error: null });
    } catch (error) {
      set({ status: 'unauthenticated', error: errorMessage(error) });
      throw error;
    }
  },
  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      set({ status: 'unauthenticated', user: null, error: null });
    }
  },
}));
