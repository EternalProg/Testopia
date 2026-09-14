import { z } from 'zod';

export * from './domain.js';
export * from './schemas.js';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
