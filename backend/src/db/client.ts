import { drizzle } from 'drizzle-orm/mysql2';
import type { Pool } from 'mysql2/promise';
import mysql from 'mysql2/promise';

import { schema } from './schema.js';

export function createDatabase(databaseUrl: string) {
  const pool = mysql.createPool(databaseUrl);
  const db = drizzle({ client: pool, schema, mode: 'default' });

  return { db, pool };
}

export type Database = ReturnType<typeof createDatabase>['db'];
export type DatabasePool = Pool;
