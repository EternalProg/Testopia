import { describe, expect, it } from 'vitest';

import { healthResponseSchema } from './index.js';

describe('healthResponseSchema', () => {
  it('accepts the healthy response', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('rejects an invalid status', () => {
    expect(() => healthResponseSchema.parse({ status: 'error' })).toThrow();
  });
});
