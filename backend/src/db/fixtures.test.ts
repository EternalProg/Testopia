import { describe, expect, it } from 'vitest';

import { questionFixture, testFixture, userFixture } from './fixtures.js';

describe('database fixtures', () => {
  it('contains valid values for the shared contracts', () => {
    expect(userFixture.email).toContain('@');
    expect(testFixture.isPublished).toBe(true);
    expect(questionFixture.options).toHaveLength(2);
  });
});
