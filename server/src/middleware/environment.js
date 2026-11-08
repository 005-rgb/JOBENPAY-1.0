// @ts-check

export const VALID_ENVIRONMENTS = new Set(['SANDBOX', 'PRODUCTION', 'SIMULATED']);

/**
 * Middleware untuk mengisolasi dan mendeteksi runtime environment (PRD 2.1 §1 & §4).
 * Default ke 'SANDBOX'.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function environmentMiddleware(req, res, next) {
  const rawEnv = req.headers['x-environment'] || req.query?.environment;
  const envUpper = typeof rawEnv === 'string' ? rawEnv.toUpperCase() : null;

  req.environment = envUpper && VALID_ENVIRONMENTS.has(envUpper) ? envUpper : 'SANDBOX';
  res.setHeader('X-Environment', req.environment);
  next();
}

export default environmentMiddleware;
