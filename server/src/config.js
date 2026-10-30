import { z } from 'zod';

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor !== 22) {
  throw new Error('JOBENPAY requires Node.js 22. Use .nvmrc or .replit settings.');
}

const optionalBase64Key = z
  .string()
  .trim()
  .min(16)
  .optional();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/jobenpay'),
  TEST_DATABASE_URL: z.string().optional(),
  AI_PROVIDER: z.enum(['anthropic', 'openai', 'replay']).default('replay'),
  AI_MODEL: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().url().optional().or(z.literal('')),
  AI_DAILY_BUDGET_USD: z.coerce.number().nonnegative().default(5),
  REGISTRATION_ENABLED: z.coerce.number().int().min(0).max(1).default(0),
  WORKER_ENABLED: z.coerce.number().int().min(0).max(1).default(0),
  PAYPAL_API_BASE: z.string().url().default('https://api-m.sandbox.paypal.com'),
  JOBENPAY_ENC_KEY: optionalBase64Key,
  JOBENPAY_LEDGER_SIGNING_KEY: optionalBase64Key,
  JOBENPAY_HMAC_PEPPER: optionalBase64Key,
});

export const env = envSchema.parse(process.env);
