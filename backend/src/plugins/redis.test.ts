import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const connect = vi.fn().mockResolvedValue('OK');
const ping = vi.fn().mockResolvedValue('PONG');
const quit = vi.fn().mockResolvedValue('OK');
const on = vi.fn();
const createRedis = vi.fn(() => ({ connect, ping, quit, on }));
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
    connect.mockClear();
    ping.mockClear();
    quit.mockClear();
    on.mockClear();
    createRedis.mockClear();
    ping.mockResolvedValue('PONG');
  });

  it('decorates the instance and quits on close', async () => {
    const app = Fastify();
    app.register(redisPlugin);

    await app.ready();
    expect(createRedis).toHaveBeenCalledWith('redis://localhost:6379');
    // The shared client is lazy with the offline queue off, so the first
    // command would fail instantly: the plugin must connect before pinging.
    expect(connect).toHaveBeenCalledOnce();
    expect(ping).toHaveBeenCalledOnce();
    expect(connect.mock.invocationCallOrder[0]).toBeLessThan(ping.mock.invocationCallOrder[0]!);
    expect(app.redis).toBeDefined();
    // Connection failures stay visible even though dependents fail open/closed.
    expect(on).toHaveBeenCalledWith('error', expect.any(Function));

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
