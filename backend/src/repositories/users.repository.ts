import { eq } from 'drizzle-orm';

import type { UserRole } from '@testopia/shared';

import type { Database } from '../db/client.js';
import { users } from '../db/schema.js';

/**
 * The subset of the users row that is safe to hand to any client: the
 * password hash is deliberately absent.
 */
export type PublicUserRow = Pick<
  typeof users.$inferSelect,
  'id' | 'email' | 'username' | 'role' | 'createdAt'
>;

export const publicUserColumns = {
  id: users.id,
  email: users.email,
  username: users.username,
  role: users.role,
  createdAt: users.createdAt,
} as const;

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

  // Admin listing. The columns are named explicitly instead of using a bare
  // select(), which would pull password_hash into the admin response.
  async listUsers(): Promise<PublicUserRow[]> {
    return this.db.select(publicUserColumns).from(users).orderBy(users.id);
  }

  async updateRole(id: number, role: UserRole): Promise<PublicUserRow | null> {
    await this.db.update(users).set({ role }).where(eq(users.id, id));
    return this.findPublicById(id);
  }

  private async findPublicById(id: number): Promise<PublicUserRow | null> {
    const rows = await this.db
      .select(publicUserColumns)
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return rows[0] ?? null;
  }
}
