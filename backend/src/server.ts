import 'dotenv/config';

import { buildApp } from './app.js';

const port = Number(process.env.BACKEND_PORT ?? 3000);
const host = process.env.BACKEND_HOST ?? '0.0.0.0';
const app = buildApp({ database: true });

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
