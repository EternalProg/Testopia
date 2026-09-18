import { z } from 'zod';

const authEnvironmentSchema = z.object({
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_ISSUER: z.string().default('testopia'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
});

export function getTokenConfig(environment: NodeJS.ProcessEnv = process.env) {
  const values = authEnvironmentSchema.parse(environment);
  return {
    accessSecret: values.JWT_ACCESS_SECRET,
    refreshSecret: values.JWT_REFRESH_SECRET,
    accessTtl: values.JWT_ACCESS_TTL,
    issuer: values.JWT_ISSUER,
    refreshTtlMs: values.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}
