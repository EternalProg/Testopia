import type { Session } from './auth/types.js';
import type { User } from '@testopia/shared';
import {
  createQuestionSchema,
  createTestSchema,
  loginSchema,
  registerSchema,
  submitAttemptSchema,
} from '@testopia/shared';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

import { attemptsApi } from './attempts/api.js';
import { authApi } from './auth/api.js';
import { useAuthStore } from './auth/store.js';
import { server } from './test/server.js';
import { handlers, session, user } from './test/mocks.js';
import { testsApi } from './tests/api.js';

// Frontend/backend drift check without new dependencies: every request body
// produced by a domain client must parse against the shared Zod contract, and
// the MSW response fixtures must carry the Api* mirror shapes. Any drift is
// fixed in the clients/mocks, never by loosening the shared schemas.
describe('API contract (frontend clients vs shared schemas)', () => {
  const seen: Record<string, unknown> = {};

  function capture(
    method: 'post',
    path: string,
    key: string,
    body: Record<string, unknown> | unknown[],
    status = 200,
  ) {
    server.use(
      http[method](path, async ({ request }) => {
        seen[key] = await request.json();
        return HttpResponse.json(body, { status });
      }),
    );
  }

  afterEach(() => {
    for (const key of Object.keys(seen)) delete seen[key];
    authApi.clearAccessToken();
    useAuthStore.setState({ status: 'idle', user: null, error: null });
  });

  it('sends register/login payloads matching the shared auth schemas', async () => {
    capture('post', '/api/v1/auth/register', 'register', session, 201);
    capture('post', '/api/v1/auth/login', 'login', session);

    await authApi.register({
      email: 'contract@example.com',
      username: 'contract-user',
      password: 'password123',
    });
    await authApi.login({ email: 'contract@example.com', password: 'password123' });

    expect(registerSchema.safeParse(seen.register).success).toBe(true);
    expect(loginSchema.safeParse(seen.login).success).toBe(true);
  });

  it('sends createTest/createQuestion payloads matching the shared test schemas', async () => {
    capture('post', '/api/v1/auth/register', 'register', session, 201);
    await authApi.register({
      email: 'contract@example.com',
      username: 'contract-user',
      password: 'password123',
    });

    capture('post', '/api/v1/tests', 'createTest', { test: {}, questions: [] });
    await testsApi.create({
      title: 'Contract test',
      description: null,
      isPublished: false,
      shuffleQuestions: false,
      timeLimitMinutes: 15,
      showAnswersAfterCompletion: true,
      showQuestionsBeforeStart: true,
      availableFrom: null,
      availableUntil: null,
    });

    capture('post', '/api/v1/tests/1/questions', 'createQuestion', { id: 1 });
    await testsApi.createQuestion(1, {
      text: 'Contract question?',
      type: 'single_choice',
      orderIndex: 0,
      options: [
        { text: 'Yes', isCorrect: true },
        { text: 'No', isCorrect: false },
      ],
    });

    expect(createTestSchema.safeParse(seen.createTest).success).toBe(true);
    expect(createQuestionSchema.safeParse(seen.createQuestion).success).toBe(true);
  });

  it('sends submitAttempt payloads matching the shared attempt schema', async () => {
    capture('post', '/api/v1/auth/register', 'register', session, 201);
    await authApi.register({
      email: 'contract@example.com',
      username: 'contract-user',
      password: 'password123',
    });

    capture('post', '/api/v1/attempts/1/submit', 'submit', {
      attempt: {},
      answers: [],
      answersRevealed: true,
    });
    await attemptsApi.submit(1, {
      answers: [
        { questionId: 2, selectedOptionIds: [3], textAnswer: null },
        { questionId: 4, selectedOptionIds: [], textAnswer: 'free text' },
      ],
    });

    expect(submitAttemptSchema.safeParse(seen.submit).success).toBe(true);
  });

  it('omits Content-Type on bodyless requests so servers skip JSON parsing', async () => {
    const contentTypes: Record<string, string | null> = {};
    const record = (key: string) => ({
      handler: ({ request }: { request: Request }) => {
        contentTypes[key] = request.headers.get('Content-Type');
        return HttpResponse.json({});
      },
    });
    server.use(
      http.post('/api/v1/tests/1/publish', record('publish').handler),
      http.delete('/api/v1/tests/1', record('delete').handler),
      http.post('/api/v1/tests/1/attempts', record('start').handler),
    );

    await testsApi.publish(1);
    await testsApi.delete(1);
    await attemptsApi.start(1);

    expect(contentTypes.publish).toBeNull();
    expect(contentTypes.delete).toBeNull();
    expect(contentTypes.start).toBeNull();
  });

  it('keeps MSW auth fixtures aligned with the Api* mirrors', () => {
    const sessionMirror: Session = {
      ...session,
      user: { ...session.user, createdAt: new Date(session.user.createdAt) },
    };
    const userMirror: User = {
      ...user,
      createdAt: new Date(user.createdAt),
    };

    expect(sessionMirror).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: { id: expect.any(Number), email: expect.any(String), role: 'user' },
    });
    expect(userMirror.email).toContain('@');
    expect(handlers.length).toBeGreaterThanOrEqual(6);
  });
});
