import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('hashes passwords and verifies only the original value', async () => {
    const passwordHash = await hashPassword('correct horse battery staple');

    expect(passwordHash).not.toBe('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', passwordHash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', passwordHash)).resolves.toBe(false);
  });
});
