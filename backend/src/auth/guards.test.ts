import { describe, expect, it, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';

import { authenticationGuard, roleGuard } from './guards.js';
import type { TokenService } from './tokens.js';

describe('authentication guards', () => {
  it('requires a bearer token and attaches a verified identity', async () => {
    const tokens = {
      verifyAccessToken: vi.fn().mockResolvedValue({ sub: '2', role: 'admin', type: 'access' }),
    } as unknown as TokenService;
    const request = { headers: { authorization: 'Bearer token' } } as FastifyRequest;
    await authenticationGuard(tokens)(request, {} as never);
    expect(request.authUser).toEqual({ id: 2, role: 'admin' });
  });

  it('rejects missing/invalid credentials and disallowed roles', async () => {
    const tokens = {
      verifyAccessToken: vi.fn().mockRejectedValue(new Error('bad token')),
    } as unknown as TokenService;
    await expect(
      authenticationGuard(tokens)({ headers: {} } as never, {} as never),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      roleGuard('admin')({ authUser: { id: 1, role: 'user' } } as never, {} as never),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
