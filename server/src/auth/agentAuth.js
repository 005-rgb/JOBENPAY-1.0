import crypto from 'node:crypto';

import { env } from '../config.js';
import { hmacSha256 } from '../lib/crypto.js';
import { rateLimit } from '../repositories/rateLimit.js';
import {
  getAgentKeysByPrefix,
  touchAgentKey,
} from '../repositories/agents.js';

const API_KEY_PATTERN = /^jp_sbx_([A-Za-z0-9_-]{8})_([A-Za-z0-9_-]{32})$/;

function authError(code, statusCode) {
  const error = new Error(code === 'RATE_LIMITED' ? 'Rate limit exceeded.' : 'Agent authentication failed.');
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export function parseAgentApiKey(value) {
  const match = API_KEY_PATTERN.exec(String(value || ''));
  if (!match) {
    return null;
  }
  return {
    prefix: `jp_sbx_${match[1]}`,
    key: String(value),
  };
}

export function createAgentAuth({
  pepper = env.JOBENPAY_HMAC_PEPPER,
  findKeys = getAgentKeysByPrefix,
  touchKey = touchAgentKey,
  applyRateLimit = rateLimit,
} = {}) {
  return async function agentAuthMiddleware(req, _res, next) {
    try {
      if (!pepper) {
        throw new Error('JOBENPAY_HMAC_PEPPER is required for agent authentication.');
      }
      const authorization = req.get('authorization') || '';
      const bearer = /^Bearer ([^\s]+)$/i.exec(authorization);
      const parsed = parseAgentApiKey(bearer?.[1]);
      if (!parsed) {
        throw authError('UNAUTHENTICATED', 401);
      }

      const actual = Buffer.from(hmacSha256(pepper, parsed.key), 'hex');
      const candidates = await findKeys(parsed.prefix);
      let stored = null;
      for (const candidate of candidates) {
        if (!/^[a-f0-9]{64}$/i.test(candidate.key_hash || '')) {
          continue;
        }
        const expected = Buffer.from(candidate.key_hash, 'hex');
        if (expected.length === actual.length && crypto.timingSafeEqual(expected, actual)) {
          stored = candidate;
        }
      }
      if (!stored) {
        throw authError('UNAUTHENTICATED', 401);
      }
      if (stored.revoked_at) {
        throw authError('UNAUTHENTICATED', 401);
      }
      if (stored.agent_status !== 'ACTIVE') {
        throw authError('FORBIDDEN', 403);
      }

      if (!(await touchKey(stored.org_id, stored.id))) {
        throw authError('UNAUTHENTICATED', 401);
      }
      if (await applyRateLimit(`agent:${stored.id}`, 60, 60)) {
        throw authError('RATE_LIMITED', 429);
      }

      req.agent = { id: stored.agent_id, orgId: stored.org_id };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function assertOwnedByAgent(agentId, resourceAgentId) {
  if (!agentId || !resourceAgentId || String(agentId) !== String(resourceAgentId)) {
    const error = new Error('Resource not found.');
    error.code = 'NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }
}

export const agentAuth = createAgentAuth();
