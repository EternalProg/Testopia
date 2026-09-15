import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolEnd = vi.fn();
const migrationError = new Error('migration failed');

vi.mock('../db/client.js', () => ({
  createDatabase: vi.fn(() => ({ db: {}, pool: { end: poolEnd } })),
}));
vi.mock('../db/config.js', () => ({
  getDatabaseUrl: vi.fn(() => 'mysql://test:test@localhost:3306/test_practiceworks'),
}));
vi.mock('drizzle-orm/mysql2/migrator', () => ({
  migrate: vi.fn().mockRejectedValue(migrationError),
}));

const { default: databasePlugin } = await import('./database.js');

describe('database plugin startup failure', () => {
  beforeEach(() => {
    poolEnd.mockClear();
  });

  it('closes the pool when migrations fail before startup completes', async () => {
    const app = Fastify();
    app.register(databasePlugin);

    await expect(app.ready()).rejects.toThrow(migrationError);
    expect(poolEnd).toHaveBeenCalledOnce();
  });
});
