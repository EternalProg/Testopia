import { and, eq, gt, isNull } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { refreshTokens } from '../db/schema.js';
import { withTransaction } from '../db/transaction.js';

export class RefreshTokensRepository {
  constructor(private readonly db: Database) {}

  async create(input: typeof refreshTokens.$inferInsert) {
    await this.db.insert(refreshTokens).values(input);
  }

  async findByHash(tokenHash: string) {
    const rows = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    return rows[0] ?? null;
  }

  async revoke(id: string, replacedByTokenId: string | null = null) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedByTokenId })
      .where(eq(refreshTokens.id, id));
  }

  async rotate(
    id: string,
    replacement: typeof refreshTokens.$inferInsert,
    now = new Date(),
  ): Promise<boolean> {
    return withTransaction(this.db, async (transaction) => {
      const result = await transaction
        .update(refreshTokens)
        .set({ revokedAt: now, replacedByTokenId: replacement.id })
        .where(
          and(
            eq(refreshTokens.id, id),
            isNull(refreshTokens.revokedAt),
            gt(refreshTokens.expiresAt, now),
          ),
        );

      if (result[0].affectedRows !== 1) return false;
      await transaction.insert(refreshTokens).values(replacement);
      return true;
    });
  }
}
