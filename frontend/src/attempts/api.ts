import type { SubmitAttemptInput } from '@practice-works/shared';

import type {
  ApiAttemptHistoryItem,
  ApiAttemptResult,
  AttemptDetail,
  ExpiredSubmitBody,
  SubmitAttemptResult,
} from './types.js';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
let accessToken: string | null = null;

export class AttemptApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: { error?: string; message?: string } & Partial<ExpiredSubmitBody>,
  ) {
    super(payload.message ?? payload.error ?? 'Request failed');
    this.name = 'AttemptApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    let payload: AttemptApiError['payload'] = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      // Keep the HTTP status when the server has no JSON error body.
    }
    throw new AttemptApiError(response.status, payload);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const attemptsApi = {
  setAccessToken(token: string | null) {
    accessToken = token;
  },
  start(testId: number): Promise<AttemptDetail> {
    return request(`/api/v1/tests/${testId}/attempts`, { method: 'POST' });
  },
  get(attemptId: number): Promise<AttemptDetail> {
    return request(`/api/v1/attempts/${attemptId}`);
  },
  submit(attemptId: number, input: SubmitAttemptInput): Promise<SubmitAttemptResult> {
    return request(`/api/v1/attempts/${attemptId}/submit`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  result(attemptId: number): Promise<ApiAttemptResult> {
    return request(`/api/v1/attempts/${attemptId}/result`);
  },
  listByTest(testId: number): Promise<ApiAttemptHistoryItem[]> {
    return request(`/api/v1/tests/${testId}/attempts`);
  },
};
