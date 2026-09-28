import { Redis } from 'ioredis';

export type RedisClient = Redis;

/**
 * Shared Redis client. Sessions fail closed without Redis, so commands must
 * reject promptly when disconnected instead of queueing behind a dead
 * connection: the offline queue is off and every command gets a small retry
 * budget. Reconnection itself retries with capped backoff, so a
 * slow-starting Redis only delays startup (see plugins/redis).
 */
export function createRedis(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 100, 2000),
  });
}
