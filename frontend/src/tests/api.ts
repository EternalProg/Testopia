import type { CreateQuestionInput, CreateTestInput, UpdateTestInput } from '@practice-works/shared';
import type { QuestionType } from '@practice-works/shared';

export type UpdateQuestionInput = {
  text?: string;
  type?: QuestionType;
  orderIndex?: number;
  options?: Array<{ text: string; isCorrect: boolean }>;
};

import type { ApiQuestion, TestDetail, TestListItem } from './types.js';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
let accessToken: string | null = null;

export class TestApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: { error?: string; message?: string },
  ) {
    super(payload.message ?? payload.error ?? 'Request failed');
    this.name = 'TestApiError';
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
    throw new TestApiError(response.status, payload);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const testPath = (id: number) => `/api/v1/tests/${id}`;

export const testsApi = {
  setAccessToken(token: string | null) {
    accessToken = token;
  },
  list(scope?: 'mine'): Promise<TestListItem[]> {
    return request(`/api/v1/tests${scope ? '?scope=mine' : ''}`);
  },
  get(id: number): Promise<TestDetail> {
    return request(testPath(id));
  },
  create(input: CreateTestInput): Promise<TestDetail> {
    return request('/api/v1/tests', { method: 'POST', body: JSON.stringify(input) });
  },
  update(id: number, input: UpdateTestInput): Promise<TestDetail> {
    return request(testPath(id), { method: 'PATCH', body: JSON.stringify(input) });
  },
  delete(id: number): Promise<void> {
    return request(testPath(id), { method: 'DELETE' });
  },
  publish(id: number): Promise<TestDetail> {
    return request(`${testPath(id)}/publish`, { method: 'POST' });
  },
  unpublish(id: number): Promise<TestDetail> {
    return request(`${testPath(id)}/unpublish`, { method: 'POST' });
  },
  createQuestion(testId: number, input: CreateQuestionInput): Promise<ApiQuestion> {
    return request(`${testPath(testId)}/questions`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  updateQuestion(
    testId: number,
    questionId: number,
    input: UpdateQuestionInput,
  ): Promise<ApiQuestion> {
    return request(`${testPath(testId)}/questions/${questionId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
  deleteQuestion(testId: number, questionId: number): Promise<void> {
    return request(`${testPath(testId)}/questions/${questionId}`, { method: 'DELETE' });
  },
};
