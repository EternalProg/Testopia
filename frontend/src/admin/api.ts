import type { UserRole } from '@testopia/shared';

import type { ApiUser } from './types.js';
import { requestFailedMessage } from '../i18n/uk.js';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
let accessToken: string | null = null;

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: { error?: string; message?: string },
  ) {
    // Non-JSON error bodies (e.g. a proxy 502 page when the backend is down)
    // keep the HTTP status so the failure stays diagnosable from the UI.
    super(payload.message ?? payload.error ?? requestFailedMessage(status));
    this.name = 'AdminApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    let payload: AdminApiError['payload'] = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      // Keep the HTTP status when the server has no JSON error body.
    }
    throw new AdminApiError(response.status, payload);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const adminApi = {
  setAccessToken(token: string | null) {
    accessToken = token;
  },
  listUsers(): Promise<ApiUser[]> {
    return request('/api/v1/admin/users');
  },
  setRole(id: number, role: UserRole): Promise<ApiUser> {
    return request(`/api/v1/admin/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },
};
