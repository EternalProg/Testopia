import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const poolEnd = vi.fn();

vi.mock('./db/client.js', () => ({
  createDatabase: vi.fn(() => ({ db: {}, pool: { end: poolEnd } })),
}));
vi.mock('./db/config.js', () => ({
  getDatabaseUrl: vi.fn(() => 'mysql://test:test@localhost:3306/test_practiceworks'),
}));

const { buildApp } = await import('./app.js');

describe('database plugin integration', () => {
  const app = buildApp({ database: true });

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'access-secret-that-is-long-enough';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret-that-is-long-enough';
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    expect(poolEnd).toHaveBeenCalledOnce();
  });

  it('registers the database and auth routes through Fastify plugins', async () => {
    expect(app.db).toBeDefined();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
  });
});
