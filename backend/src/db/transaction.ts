import type { Database } from './client.js';

type TransactionCallback = Parameters<Database['transaction']>[0];
type Transaction = TransactionCallback extends (transaction: infer T) => unknown ? T : never;

export function withTransaction<T>(
  database: Database,
  callback: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  return database.transaction(callback as TransactionCallback) as Promise<T>;
}
