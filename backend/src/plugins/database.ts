import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import { createDatabase, type Database, type DatabasePool } from '../db/client.js';
import { getDatabaseUrl } from '../db/config.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    dbPool: DatabasePool;
  }
}

const databasePlugin: FastifyPluginAsync = async (app) => {
  const { db, pool } = createDatabase(getDatabaseUrl());

  app.decorate('db', db);
  app.decorate('dbPool', pool);
  app.addHook('onClose', async () => pool.end());
};

export default fp(databasePlugin, { name: 'database' });
