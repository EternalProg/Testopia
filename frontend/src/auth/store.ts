import type { LoginInput, RegisterInput, User } from '@practice-works/shared';
import { create } from 'zustand';

import { ApiError, authApi } from './api.js';
import type { AuthStatus } from './types.js';
import { tokenStorage } from './token-storage.js';

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

export const useAuthStore = create<AuthState>((set) => ({
  status: 'idle',
  user: null,
  error: null,
  initialize: async () => {
    if (!tokenStorage.getRefreshToken()) {
      set({ status: 'unauthenticated', user: null });
      return;
    }
    set({ status: 'loading', error: null });
    try {
      await authApi.refresh();
      const user = await authApi.me();
      set({ status: 'authenticated', user, error: null });
    } catch {
      authApi.clearAccessToken();
      tokenStorage.clear();
      set({ status: 'unauthenticated', user: null });
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
    await authApi.logout();
    set({ status: 'unauthenticated', user: null, error: null });
  },
}));
