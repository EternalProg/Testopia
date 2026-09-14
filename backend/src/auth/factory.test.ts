import { describe, expect, it } from 'vitest';

import type { Database } from '../db/client.js';
import { createAuthServices } from './factory.js';

describe('auth service factory', () => {
  it('builds token and authentication services from a database', () => {
    const originalAccess = process.env.JWT_ACCESS_SECRET;
    const originalRefresh = process.env.JWT_REFRESH_SECRET;
    process.env.JWT_ACCESS_SECRET = 'access-secret-that-is-long-enough';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret-that-is-long-enough';

    const services = createAuthServices({} as Database);

    expect(services.service).toBeDefined();
    expect(services.tokens).toBeDefined();
    process.env.JWT_ACCESS_SECRET = originalAccess;
    process.env.JWT_REFRESH_SECRET = originalRefresh;
  });
});
