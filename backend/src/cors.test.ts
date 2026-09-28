import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import { getCorsOptions } from './cors.js';

describe('CORS configuration', () => {
  it('defaults to same-origin behavior without an allowlist', () => {
    expect(getCorsOptions('')).toMatchObject({ origin: false, credentials: true });
  });

  it('rejects wildcard configuration', () => {
    expect(() => getCorsOptions('*')).toThrow('explicit origins');
  });

  describe('registered plugin', () => {
    const app = buildApp({ corsOrigin: 'http://localhost:5173' });

    beforeAll(async () => app.ready());
    afterAll(async () => app.close());

    it('allows configured origins and omits CORS headers for other origins', async () => {
      const allowed = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'http://localhost:5173' },
      });
      const rejected = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'https://untrusted.example' },
      });

      expect(allowed.statusCode).toBe(200);
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(rejected.statusCode).toBe(200);
      expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
