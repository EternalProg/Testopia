/**
 * Detects MySQL duplicate-entry failures even when the ORM wraps the driver
 * error. Drizzle throws a `DrizzleQueryError` whose `code` is undefined; the
 * mysql2 `ER_DUP_ENTRY` code (errno 1062) lives on the `cause` chain.
 */
export function isDuplicateEntryError(error: unknown): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);
    const record = current as Record<string, unknown>;
    if (record.code === 'ER_DUP_ENTRY' || record.errno === 1062) return true;
    if (!('cause' in record)) return false;
    current = record.cause;
  }
  return false;
}
