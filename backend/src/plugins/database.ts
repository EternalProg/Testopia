import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/mysql2/migrator';

import { createDatabase, type Database, type DatabasePool } from '../db/client.js';
import { getDatabaseUrl } from '../db/config.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    dbPool: DatabasePool;
  }
}

export async function migrateDatabase(db: Database): Promise<void> {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../db/migrations', import.meta.url)),
  });
}

const databasePlugin: FastifyPluginAsync = async (app) => {
  const { db, pool } = createDatabase(getDatabaseUrl());

  app.decorate('db', db);
  app.decorate('dbPool', pool);
  app.addHook('onClose', async () => pool.end());

  await migrateDatabase(db);
};

export default fp(databasePlugin, { name: 'database' });
