import { drizzle } from 'drizzle-orm/mysql-proxy';
import { describe, expect, it } from 'vitest';

import type { Database } from '../db/client.js';
import { schema } from '../db/schema.js';
import { AttemptsRepository } from './attempts.repository.js';

/**
 * The aggregate is asserted through the SQL it emits: a mocked driver result
 * cannot prove that in-progress attempts are excluded, only that a number came
 * back. The proxy driver captures the statement without opening a connection.
 */
function capturingDatabase() {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const database = drizzle(
    async (sql: string, params: unknown[]) => {
      statements.push({ sql, params });
      return { rows: [[2]] };
    },
    { schema },
  ) as unknown as Database;
  return { database, statements };
}

describe('AttemptsRepository.countTerminalByUser', () => {
  it('aggregates only completed and expired attempts of that taker and test', async () => {
    const { database, statements } = capturingDatabase();
    const repository = new AttemptsRepository(database);

    await expect(repository.countTerminalByUser(7, 3)).resolves.toBe(2);

    expect(statements).toHaveLength(1);
    const [statement] = statements;
    expect(statement?.sql).toContain('select count(*) from `test_attempts`');
    expect(statement?.sql).toContain('`test_attempts`.`user_id` = ?');
    expect(statement?.sql).toContain('`test_attempts`.`test_id` = ?');
    // in_progress attempts resume instead of consuming the budget, so the
    // status filter must exclude them.
    expect(statement?.sql).toContain('`test_attempts`.`status` in (?, ?)');
    expect(statement?.params).toEqual([7, 3, 'completed', 'expired']);
  });

  it('reports zero when the taker has no attempts for the test', async () => {
    const database = drizzle(async () => ({ rows: [] }), { schema }) as unknown as Database;

    await expect(new AttemptsRepository(database).countTerminalByUser(7, 3)).resolves.toBe(0);
  });
});
