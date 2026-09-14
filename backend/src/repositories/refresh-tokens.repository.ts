import { eq } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { refreshTokens } from '../db/schema.js';

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
}
