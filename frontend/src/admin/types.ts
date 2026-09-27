import type { User } from '@testopia/shared';

export type ApiUser = Omit<User, 'createdAt'> & { createdAt: string };
