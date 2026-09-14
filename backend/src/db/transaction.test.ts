import { describe, expect, it, vi } from 'vitest';

import type { Database } from './client.js';
import { withTransaction } from './transaction.js';

describe('withTransaction', () => {
  it('propagates callback failures so the database can roll back', async () => {
    const rollback = vi.fn();
    const database = {
      transaction: vi.fn(async (callback: (transaction: never) => Promise<never>) => {
        try {
          return await callback(undefined as never);
        } catch (error) {
          rollback();
          throw error;
        }
      }),
    } as unknown as Database;

    await expect(
      withTransaction(database, async () => {
        throw new Error('token insert failed');
      }),
    ).rejects.toThrow('token insert failed');
    expect(rollback).toHaveBeenCalledOnce();
  });
});
