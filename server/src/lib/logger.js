import crypto from 'node:crypto';
import pino from 'pino';

const redactPaths = [
  'authorization',
  'cookie',
  'client_secret',
  'api_key',
  'password',
  '*_enc',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.cookie',
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: undefined,
  redact: {
    paths: redactPaths,
    remove: true,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

export function attachRequestLogger(req, res, next) {
  const requestId = req.headers['x-request-id'] ?? crypto.randomUUID();
  req.id = String(requestId);
  res.setHeader('x-request-id', req.id);
  req.log = logger.child({ requestId: req.id });
  next();
}
