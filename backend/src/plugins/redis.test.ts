import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ping = vi.fn().mockResolvedValue('PONG');
const quit = vi.fn().mockResolvedValue('OK');
const createRedis = vi.fn(() => ({ ping, quit }));
const pingError = new Error('redis unreachable');

vi.mock('../redis/client.js', () => ({
  createRedis,
}));
vi.mock('../redis/config.js', () => ({
  getRedisUrl: vi.fn(() => 'redis://localhost:6379'),
}));

const { default: redisPlugin } = await import('./redis.js');

describe('redis plugin', () => {
  beforeEach(() => {
    ping.mockClear();
    quit.mockClear();
    createRedis.mockClear();
    ping.mockResolvedValue('PONG');
  });

  it('decorates the instance and quits on close', async () => {
    const app = Fastify();
    app.register(redisPlugin);

    await app.ready();
    expect(createRedis).toHaveBeenCalledWith('redis://localhost:6379');
    expect(ping).toHaveBeenCalledOnce();
    expect(app.redis).toBeDefined();

    await app.close();
    expect(quit).toHaveBeenCalledOnce();
  });

  it('refuses startup when Redis never answers', async () => {
    ping.mockRejectedValueOnce(pingError);
    const app = Fastify();
    app.register(redisPlugin);

    await expect(app.ready()).rejects.toThrow(pingError);
    // The half-open client is released instead of leaking the connection.
    expect(quit).toHaveBeenCalledOnce();
  });
});
