import { z } from 'zod';

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor !== 22) {
  throw new Error('JOBENPAY requires Node.js 22. Use .nvmrc or .replit settings.');
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/jobenpay'),
  AI_PROVIDER: z.enum(['anthropic', 'openai', 'replay']).default('replay'),
  AI_DAILY_BUDGET_USD: z.coerce.number().nonnegative().default(5),
  REGISTRATION_ENABLED: z.coerce.number().int().min(0).max(1).default(0),
  JOBENPAY_ENC_KEY: z.string().min(16).optional(),
  JOBENPAY_LEDGER_SIGNING_KEY: z.string().min(16).optional(),
  JOBENPAY_HMAC_PEPPER: z.string().min(8).optional(),
});

export const env = envSchema.parse(process.env);
