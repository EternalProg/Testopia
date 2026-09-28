import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

import { createRedis, type RedisClient } from '../redis/client.js';
import { getRedisUrl } from '../redis/config.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: RedisClient;
  }
}

const redisPlugin: FastifyPluginAsync = async (app) => {
  const redis = createRedis(getRedisUrl());
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
