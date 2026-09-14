import { http, HttpResponse } from 'msw';

export const user = {
  id: 1,
  email: 'user@example.com',
  username: 'test-user',
  role: 'user' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const session = {
  user,
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  refreshTokenExpiresAt: '2026-02-01T00:00:00.000Z',
};

export const handlers = [
  http.post('/api/v1/auth/register', () => HttpResponse.json(session, { status: 201 })),
  http.post('/api/v1/auth/login', () => HttpResponse.json(session)),
  http.post('/api/v1/auth/refresh', () => HttpResponse.json(session)),
  http.post('/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
  http.get('/api/v1/auth/me', () => HttpResponse.json(user)),
];
