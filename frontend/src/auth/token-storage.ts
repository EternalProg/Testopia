const refreshTokenKey = 'practice-works.refresh-token';

// Access tokens stay in memory; only the refresh token survives a tab refresh.
export const tokenStorage = {
  getRefreshToken(): string | null {
    return sessionStorage.getItem(refreshTokenKey);
  },
  setRefreshToken(token: string): void {
    sessionStorage.setItem(refreshTokenKey, token);
  },
  clear(): void {
    sessionStorage.removeItem(refreshTokenKey);
  },
};
