import { eq } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { users } from '../db/schema.js';

export class UsersRepository {
  constructor(private readonly db: Database) {}

  async findByEmail(email: string) {
    const rows = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return rows[0] ?? null;
  }

  async findById(id: number) {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async create(input: { email: string; username: string; passwordHash: string }) {
    const result = await this.db.insert(users).values(input);
    const user = await this.findById(result[0].insertId);

    if (!user) {
      throw new Error('Created user could not be loaded');
    }

    return user;
  }
}
