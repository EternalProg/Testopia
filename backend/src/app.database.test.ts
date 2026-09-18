import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const poolEnd = vi.fn();

vi.mock('./db/client.js', () => ({
  createDatabase: vi.fn(() => ({ db: {}, pool: { end: poolEnd } })),
}));
vi.mock('./db/config.js', () => ({
  getDatabaseUrl: vi.fn(() => 'mysql://test:test@localhost:3306/test_testopia'),
}));
vi.mock('drizzle-orm/mysql2/migrator', () => ({ migrate: vi.fn() }));

const migrator = await import('drizzle-orm/mysql2/migrator');
const migrateMock = vi.mocked(migrator.migrate);
const { buildApp } = await import('./app.js');
const { migrateDatabase } = await import('./plugins/database.js');

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

  it('uses the committed migration files for startup migrations', async () => {
    await migrateDatabase(app.db);
    expect(migrateMock).toHaveBeenCalledOnce();

    const [database, options] = migrateMock.mock.calls[0] as [object, { migrationsFolder: string }];
    expect(database).toBe(app.db);
    expect(existsSync(join(options.migrationsFolder, '0001_mighty_zarek.sql'))).toBe(true);
  });

  it('includes migration assets in the compiled backend runtime', () => {
    const runtimeMigrationsFolder = join(process.cwd(), 'dist/db/migrations');

    expect(existsSync(join(runtimeMigrationsFolder, '0001_mighty_zarek.sql'))).toBe(true);
    expect(existsSync(join(runtimeMigrationsFolder, 'meta/_journal.json'))).toBe(true);
  });
});
