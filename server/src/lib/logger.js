import crypto from 'node:crypto';
import pino from 'pino';

const redactPaths = [
  'authorization',
  'cookie',
  'client_secret',
  'secret',
  'api_key',
  'apiKey',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'req.headers.authorization',
  'req.headers.cookie',
  'err.message',
  'err.stack',
  'err.cause',
];

function redactEncryptedFields(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => redactEncryptedFields(entry));
  }
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/_enc$/i.test(key)
        && !/(?:password|secret|token|api[_-]?key|authorization|cookie)/i.test(key))
      .map(([key, entry]) => [key, redactEncryptedFields(entry)]),
  );
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: undefined,
  redact: {
    paths: redactPaths,
    remove: true,
  },
  serializers: {
    err(error) {
      return {
        type: error?.name,
        code: error?.code,
        statusCode: error?.statusCode,
        kind: error?.kind,
      };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    log(object) {
      return redactEncryptedFields(object);
    },
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
