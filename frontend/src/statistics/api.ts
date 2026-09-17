import type { ApiTestStats } from './types.js';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
let accessToken: string | null = null;

export class StatisticsApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: { error?: string; message?: string },
  ) {
    super(payload.message ?? payload.error ?? 'Request failed');
    this.name = 'StatisticsApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    let payload: { error?: string; message?: string } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      // Keep the HTTP status when the server has no JSON error body.
    }
    throw new StatisticsApiError(response.status, payload);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const statisticsApi = {
  setAccessToken(token: string | null) {
    accessToken = token;
  },
  get(testId: number): Promise<ApiTestStats> {
    return request(`/api/v1/tests/${testId}/statistics`);
  },
};
