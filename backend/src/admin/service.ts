import type { User } from '@testopia/shared';

import type { UsersRepository } from '../repositories/users.repository.js';
import { AdminError } from './errors.js';

type Actor = { id: number; role: 'user' | 'admin' };

export class AdminService {
  constructor(private readonly users: UsersRepository) {}

  async listUsers(): Promise<User[]> {
    return this.users.listUsers();
  }

  /**
   * Admins may not edit their own role: demoting themselves would lock the
   * only account that can restore roles out of the admin panel.
   */
  async setUserRole(actor: Actor, id: number, role: User['role']): Promise<User> {
    if (id === actor.id) {
      throw new AdminError('Cannot change your own role', 'FORBIDDEN');
    }
    const user = await this.users.updateRole(id, role);
    if (!user) throw new AdminError('User not found', 'NOT_FOUND');
    return user;
  }
}
