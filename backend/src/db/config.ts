import { z } from 'zod';

const databaseUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => value.startsWith('mysql://'), {
    message: 'DATABASE_URL must use the mysql:// protocol',
  });

export function getDatabaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  return databaseUrlSchema.parse(environment.DATABASE_URL);
}

export function assertTestDatabaseUrl(databaseUrl: string): void {
  const parsedUrl = databaseUrlSchema.parse(databaseUrl);
  const databaseName = new URL(parsedUrl).pathname.replace(/^\//, '');

  if (!databaseName.startsWith('test_')) {
    throw new Error('Integration tests require a database name beginning with "test_"');
  }
}
