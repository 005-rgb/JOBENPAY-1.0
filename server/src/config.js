import { z } from 'zod';
import crypto from 'node:crypto';
import { PAYPAL_API_BASE } from './paypal/constants.js';

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor !== 22) {
  throw new Error('JOBENPAY requires Node.js 22. Use .nvmrc or .replit settings.');
}

function optionalBase64Key(byteLength) {
  return z.string().trim().optional().refine((value) => {
    if (value === undefined) return true;
    const bytes = Buffer.from(value, 'base64');
    return bytes.length === byteLength && bytes.toString('base64') === value;
  }, `must be a canonical base64 value containing ${byteLength} bytes.`);
}

const ledgerPrivateKey = z.string().trim().optional().refine((value) => {
  if (value === undefined) return true;
  try {
    const key = crypto.createPrivateKey({
      key: Buffer.from(value, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
    return key.asymmetricKeyType === 'ed25519';
  } catch {
    return false;
  }
}, 'must be a base64-encoded Ed25519 PKCS8 private key.');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/jobenpay'),
  TEST_DATABASE_URL: z.string().optional(),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  AI_PROVIDER: z.enum(['anthropic', 'openai', 'replay']).default('replay'),
  AI_MODEL: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().url().optional().or(z.literal('')),
  AI_DAILY_BUDGET_USD: z.coerce.number().nonnegative().default(5),
  AI_PRICE_IN_PER_MTOK: z.coerce.number().finite().nonnegative().default(0),
  AI_PRICE_OUT_PER_MTOK: z.coerce.number().finite().nonnegative().default(0),
  UPLOAD_DIR: z.string().trim().min(1).optional(),
  REGISTRATION_ENABLED: z.coerce.number().int().min(0).max(1).default(0),
  WORKER_ENABLED: z.coerce.number().int().min(0).max(1).default(0),
  JOBENPAY_ENC_KEY: optionalBase64Key(32),
  JOBENPAY_LEDGER_SIGNING_KEY: ledgerPrivateKey,
  JOBENPAY_LEDGER_OLD_PUBLIC_KEYS: z.string().optional(),
  JOBENPAY_HMAC_PEPPER: optionalBase64Key(32),
});

export const env = envSchema.parse(process.env);
if (process.env.PAYPAL_API_BASE && process.env.PAYPAL_API_BASE !== PAYPAL_API_BASE) {
  throw new Error('PAYPAL_API_BASE must not override the sandbox-only provider endpoint.');
}
if (process.env.PAYPAL_MODE && process.env.PAYPAL_MODE.toLowerCase() !== 'sandbox') {
  throw new Error('PAYPAL_MODE must be sandbox.');
}
if (process.env.PAYPAL_API_BASE_OVERRIDE) {
  let override;
  try {
    override = new URL(process.env.PAYPAL_API_BASE_OVERRIDE);
  } catch {
    throw new Error('PAYPAL_API_BASE_OVERRIDE must be a local test endpoint.');
  }
  if (env.NODE_ENV !== 'test'
    || !['localhost', '127.0.0.1', '::1'].includes(override.hostname)) {
    throw new Error('PAYPAL_API_BASE_OVERRIDE is permitted only for local tests.');
  }
}
if (env.AI_PROVIDER !== 'replay'
  && (env.AI_PRICE_IN_PER_MTOK === 0 || env.AI_PRICE_OUT_PER_MTOK === 0)) {
  throw new Error('AI_PRICE_IN_PER_MTOK and AI_PRICE_OUT_PER_MTOK must be set for live AI providers.');
}
if (env.NODE_ENV === 'production' && !process.env.PUBLIC_BASE_URL) {
  throw new Error('PUBLIC_BASE_URL is required in production.');
}
if (env.NODE_ENV === 'production' && !env.PUBLIC_BASE_URL.startsWith('https://')) {
  throw new Error('PUBLIC_BASE_URL must use HTTPS in production.');
}

export function assertRuntimeSecrets() {
  const missing = [
    ['JOBENPAY_ENC_KEY', env.JOBENPAY_ENC_KEY],
    ['JOBENPAY_LEDGER_SIGNING_KEY', env.JOBENPAY_LEDGER_SIGNING_KEY],
    ['JOBENPAY_HMAC_PEPPER', env.JOBENPAY_HMAC_PEPPER],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) {
    throw new Error(`Missing required runtime secrets: ${missing.join(', ')}.`);
  }
}
