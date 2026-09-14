import 'dotenv/config';

import { createAuthServices } from './auth/factory.js';
import { buildApp } from './app.js';
import { createDatabase } from './db/client.js';
import { getDatabaseUrl } from './db/config.js';

const port = Number(process.env.BACKEND_PORT ?? 3000);
const host = process.env.BACKEND_HOST ?? '0.0.0.0';
const { db, pool } = createDatabase(getDatabaseUrl());
const app = buildApp({ auth: createAuthServices(db) });
app.addHook('onClose', async () => pool.end());

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
