// @ts-check
import { AppError } from '../lib/errors.js';

export const VALID_ENVIRONMENTS = new Set(['SANDBOX', 'LIVE', 'PRODUCTION', 'SIMULATED']);

export const GLOBAL_ROUTES = [
  '/api/v1/org',
  '/api/v1/members',
  '/api/v1/billing',
  '/api/v1/auth',
];

export const OPERATIONAL_ROUTES = [
  '/api/v1/agents',
];

/**
 * Middleware untuk mengisolasi dan mendeteksi runtime environment (PRD 3.0 Revisi 2.0).
 * Default ke 'SANDBOX' untuk route global/non-operasional.
 * Wajib menyertakan X-Jobenpay-Environment untuk route operasional.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function environmentMiddleware(req, res, next) {
  const isOperationalRoute = OPERATIONAL_ROUTES.some((route) => req.path.startsWith(route));

  const rawEnv = req.headers['x-jobenpay-environment'] || req.headers['x-environment'] || req.query?.environment;
  const envUpper = typeof rawEnv === 'string' ? rawEnv.trim().toUpperCase() : null;

  if (isOperationalRoute) {
    if (!envUpper || !VALID_ENVIRONMENTS.has(envUpper)) {
      return next(new AppError('ENVIRONMENT_HEADER_MISSING', 400, 'X-Jobenpay-Environment header is missing or invalid.'));
    }
    req.environment = envUpper;
    res.setHeader('X-Jobenpay-Environment', req.environment);
    res.setHeader('X-Environment', req.environment);
    return next();
  }

  // Untuk route global atau non-operasional lainnya, gunakan environment jika valid, default ke SANDBOX
  req.environment = envUpper && VALID_ENVIRONMENTS.has(envUpper) ? envUpper : 'SANDBOX';
  res.setHeader('X-Jobenpay-Environment', req.environment);
  res.setHeader('X-Environment', req.environment);
  return next();
}

export default environmentMiddleware;
