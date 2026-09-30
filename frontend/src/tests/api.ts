import type { CreateQuestionInput, CreateTestInput, UpdateTestInput } from '@testopia/shared';
import type { Difficulty, QuestionType, TestCategory, TestListSort } from '@testopia/shared';

export type UpdateQuestionInput = {
  text?: string;
  type?: QuestionType;
  orderIndex?: number;
  options?: Array<{ text: string; isCorrect: boolean }>;
};

import type { ApiQuestion, TestDetail, TestListEnvelope, TestListItem } from './types.js';
import { requestFailedMessage } from '../i18n/uk.js';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
let accessToken: string | null = null;

export class TestApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: { error?: string; message?: string },
  ) {
    // Non-JSON error bodies (e.g. a proxy 502 page when the backend is down)
    // keep the HTTP status so the failure stays diagnosable from the UI.
    super(payload.message ?? payload.error ?? requestFailedMessage(status));
    this.name = 'TestApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
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

export interface TestListFilters {
  search?: string;
  category?: TestCategory;
  difficulty?: Difficulty;
}

export interface TestListParams extends TestListFilters {
  page?: number;
  pageSize?: number;
  sort?: TestListSort;
}

export const testsApi = {
  setAccessToken(token: string | null) {
    accessToken = token;
  },
  // Passing page opts into the { items, page, pageSize, total } envelope;
  // without it the legacy bare array is returned. Narrow on Array.isArray.
  // scope=all is admin-only server-side (the server answers 403 otherwise).
  list(
    scope?: 'mine' | 'all',
    filters: TestListParams = {},
  ): Promise<TestListItem[] | TestListEnvelope> {
    const params = new URLSearchParams();
    if (scope) params.set('scope', scope);
    if (filters.search) params.set('q', filters.search);
    if (filters.category) params.set('category', filters.category);
    if (filters.difficulty) params.set('difficulty', filters.difficulty);
    if (filters.sort) params.set('sort', filters.sort);
    if (filters.page !== undefined) params.set('page', String(filters.page));
    if (filters.pageSize !== undefined) params.set('pageSize', String(filters.pageSize));
    const query = params.toString();
    return request(`/api/v1/tests${query ? `?${query}` : ''}`);
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
