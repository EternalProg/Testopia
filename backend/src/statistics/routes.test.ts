import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { AuthService } from '../auth/service.js';
import type { TokenService } from '../auth/tokens.js';
import type { Database } from '../db/client.js';
import statisticsRoutes from './routes.js';
import { StatisticsError } from './errors.js';
import type { StatisticsService } from './service.js';

const statsPayload = {
  testId: 1,
  attemptsCount: 3,
  completedAttemptsCount: 2,
  uniqueTakers: 2,
  completionRate: 0.67,
  averageScore: 0.75,
  averageTimeSeconds: 63,
  scoreDistribution: Array.from({ length: 10 }, (_, index) => ({
    min: index * 10,
    max: index * 10 + 10,
    count: index === 9 ? 2 : 0,
  })),
  questionStats: [
    { questionId: 11, text: 'Single', attempts: 2, correctAnswers: 1, correctnessRate: 0.5 },
  ],
};

const myStatsPayload = {
  testsTaken: 2,
  totalAttempts: 3,
  completedAttempts: 2,
  passRate: 0.67,
  averageScore: 0.75,
  averageAttemptsPerTest: 1.5,
  bestScore: 1,
  tests: [
    {
      testId: 1,
      title: 'Algebra basics',
      attempts: 2,
      bestScore: 1,
      lastScore: 0.5,
      lastTakenAt: '2026-03-03T00:00:00.000Z',
      lastStatus: 'completed',
    },
    {
      testId: 2,
      title: 'Geometry',
      attempts: 1,
      bestScore: 0.5,
      lastScore: 0.5,
      lastTakenAt: '2026-03-01T00:00:00.000Z',
      lastStatus: 'completed',
    },
  ],
};

function stubTokens(overrides: Record<string, unknown> = {}) {
  return {
    verifyAccessToken: vi.fn().mockResolvedValue({ sub: '10', role: 'user' }),
    ...overrides,
  } as unknown as TokenService;
}

describe('statistics routes', () => {
  describe('through the application router', () => {
    const app = buildApp({
      auth: {
        service: {} as AuthService,
        tokens: stubTokens(),
        database: {} as Database,
      },
    });

    beforeAll(async () => app.ready());
    afterAll(async () => app.close());

    it('rejects unauthenticated statistics reads with 401', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/tests/1/statistics' });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: 'UNAUTHORIZED' });
    });

    it('rejects unauthenticated taker-overview reads with 401', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/users/me/statistics' });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: 'UNAUTHORIZED' });
    });

    it('returns a validation error for malformed test IDs', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tests/not-a-number/statistics',
        headers: { authorization: 'Bearer author-token' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
    });
  });

  describe('with an injected service', () => {
    const tokens = stubTokens();
    const getStatistics = vi.fn().mockResolvedValue(statsPayload);
    const getMyStatistics = vi.fn().mockResolvedValue(myStatsPayload);
    const app = buildApp({});
    app.register(statisticsRoutes, {
      db: {} as Database,
      tokens,
      service: { getStatistics, getMyStatistics } as unknown as StatisticsService,
    });

    beforeAll(async () => app.ready());
    afterAll(async () => app.close());

    it('returns 403 when the service reports a taker', async () => {
      getStatistics.mockRejectedValueOnce(new StatisticsError('Forbidden', 'FORBIDDEN'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tests/1/statistics',
        headers: { authorization: 'Bearer taker-token' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: 'FORBIDDEN' });
    });

    it('returns 404 when the service reports a missing test', async () => {
      getStatistics.mockRejectedValueOnce(new StatisticsError('Test not found', 'NOT_FOUND'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tests/99/statistics',
        headers: { authorization: 'Bearer author-token' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: 'NOT_FOUND' });
    });

    it('returns the statistics shape for a manager', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tests/1/statistics',
        headers: { authorization: 'Bearer author-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        testId: 1,
        attemptsCount: 3,
        completedAttemptsCount: 2,
        uniqueTakers: 2,
        completionRate: 0.67,
        averageScore: 0.75,
        averageTimeSeconds: 63,
      });
      expect(response.json().scoreDistribution).toHaveLength(10);
      expect(response.json().questionStats[0]).toMatchObject({ questionId: 11, text: 'Single' });
      expect(getStatistics).toHaveBeenCalledWith({ id: 10, role: 'user' }, 1);
    });

    it('returns the taker-overview shape for an authenticated user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/statistics',
        headers: { authorization: 'Bearer taker-token' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        testsTaken: 2,
        totalAttempts: 3,
        completedAttempts: 2,
        passRate: 0.67,
        averageScore: 0.75,
        averageAttemptsPerTest: 1.5,
        bestScore: 1,
      });
      expect(response.json().tests).toHaveLength(2);
      expect(response.json().tests[0]).toMatchObject({ testId: 1, title: 'Algebra basics' });
      expect(getMyStatistics).toHaveBeenCalledWith({ id: 10, role: 'user' });
    });
  });
});
