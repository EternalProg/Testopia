import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import { createRedis, type RedisClient } from '../redis/client.js';
import { getRedisUrl } from '../redis/config.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: RedisClient;
  }
}

export interface RedisPluginOptions {
  /** Prebuilt client (wired once in buildApp so the rate limiter can share
   * it). Explicitly absent, the plugin creates one from REDIS_URL. */
  client?: RedisClient | undefined;
}

const redisPlugin: FastifyPluginAsync<RedisPluginOptions> = async (app, options) => {
  const redis = options.client ?? createRedis(getRedisUrl());
  let clientClosed = false;
  const closeClient = async () => {
    if (!clientClosed) {
      clientClosed = true;
      try {
        await redis.quit();
      } catch (error) {
        app.log.warn(error, 'Failed to quit the Redis client cleanly');
      }
    }
  };

  app.decorate('redis', redis);
  app.addHook('onClose', closeClient);

  // Connection-level failures log here: commands already fail fast (offline
  // queue off), and dependents fail open or closed on top of that. Without a
  // listener these would stay invisible (ioredis only emits to listeners).
  redis.on('error', (error) => {
    app.log.warn(error, 'Redis connection error');
  });

  try {
    // Fail fast when Redis never answers: refresh sessions, rotation, and
    // (from later commits) rate limits all require it. The client keeps
    // retrying with backoff, so a slow-starting Redis only delays startup.
    await redis.ping();
  } catch (error) {
    try {
      await closeClient();
    } catch (closeError) {
      app.log.error(closeError, 'Failed to close the Redis client after ping failure');
    }
    throw error;
  }
};

export default fp(redisPlugin, { name: 'redis' });
