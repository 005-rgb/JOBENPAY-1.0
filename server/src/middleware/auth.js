// @ts-check
import { AppError } from '../lib/errors.js';

export const API_KEY_PATTERN = /^jp_(sbx|live)_([A-Za-z0-9_-]{8})_([A-Za-z0-9_-]{32})$/;

/**
 * Validates that an API key prefix matches the target environment.
 * Rejects cross-environment contamination with HTTP 400.
 *
 * @param {string} apiKey
 * @param {string} [environment]
 * @returns {{ valid: boolean, env: 'SANDBOX' | 'LIVE', prefix: string }}
 */
export function validateApiKeyPrefix(apiKey, environment = null) {
  const match = API_KEY_PATTERN.exec(String(apiKey || '').trim());
  if (!match) {
    const err = new AppError('INVALID_API_KEY_FORMAT', 'Invalid API key format. Must start with jp_sbx_ or jp_live_.');
    err.statusCode = 401;
    throw err;
  }

  const keyEnv = match[1] === 'live' ? 'LIVE' : 'SANDBOX';
  const requestedEnv = environment ? String(environment).trim().toUpperCase() : null;

  if (requestedEnv && (requestedEnv === 'SANDBOX' || requestedEnv === 'LIVE')) {
    if (requestedEnv === 'SANDBOX' && keyEnv === 'LIVE') {
      const err = new AppError('CROSS_ENVIRONMENT_CONTAMINATION', 'Cross-Environment Contamination Detected');
      err.statusCode = 400;
      throw err;
    }
    if (requestedEnv === 'LIVE' && keyEnv === 'SANDBOX') {
      const err = new AppError('CROSS_ENVIRONMENT_CONTAMINATION', 'Cross-Environment Contamination Detected');
      err.statusCode = 400;
      throw err;
    }
  }

  return {
    valid: true,
    env: keyEnv,
    prefix: `jp_${match[1]}_${match[2]}`,
  };
}

/**
 * Middleware for strict API key prefix and environment validation.
 */
export function strictCredentialPrefixGuard(req, res, next) {
  const authorization = req.get('authorization') || '';
  const bearer = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!bearer) {
    return next();
  }

  const apiKey = bearer[1];
  const rawEnv = req.headers['x-jobenpay-environment'] || req.headers['x-environment'] || req.environment;

  // Only check if it looks like a JobenPay agent API key
  if (apiKey.startsWith('jp_sbx_') || apiKey.startsWith('jp_live_')) {
    try {
      const { env } = validateApiKeyPrefix(apiKey, rawEnv);
      if (!req.environment) {
        req.environment = env;
      }
    } catch (err) {
      return res.status(err.statusCode || 400).json({
        error: {
          code: err.code || 'CROSS_ENVIRONMENT_CONTAMINATION',
          message: err.message || 'Cross-Environment Contamination Detected',
        },
      });
    }
  }

  return next();
}

export default {
  validateApiKeyPrefix,
  strictCredentialPrefixGuard,
  API_KEY_PATTERN,
};
