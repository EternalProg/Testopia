const refreshTokenKey = 'testopia.refresh-token';

// Access tokens stay in memory; sessionStorage keeps the JSON refresh-token contract working.
// Residual tradeoff: sessionStorage is readable by same-origin scripts, so XSS remains a risk.
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
