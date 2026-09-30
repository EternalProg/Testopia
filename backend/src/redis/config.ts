import { z } from 'zod';

const redisUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => /^rediss?:\/\//.test(value), {
    message: 'REDIS_URL must use the redis:// or rediss:// protocol',
  });

export function getRedisUrl(environment: NodeJS.ProcessEnv = process.env): string {
  return redisUrlSchema.parse(environment.REDIS_URL);
}
