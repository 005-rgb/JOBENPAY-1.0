import crypto from 'node:crypto';

import { hmacSha256 } from './crypto.js';

export function createAgentApiKey() {
  const prefixPart = crypto.randomBytes(6).toString('base64url');
  const secret = crypto.randomBytes(24).toString('base64url');
  const prefix = `jp_sbx_${prefixPart}`;
  const apiKey = `${prefix}_${secret}`;
  return { prefix, apiKey };
}

export function hashAgentApiKey(pepper, apiKey) {
  if (!pepper) {
    throw new Error('JOBENPAY_HMAC_PEPPER is required for agent API keys.');
  }
  return hmacSha256(pepper, apiKey);
}
