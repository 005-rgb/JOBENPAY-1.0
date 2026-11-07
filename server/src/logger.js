/**
 * server/src/logger.js
 * Konfigurasi Pino Logger dengan redaksi otomatis rahasia & pelacakan multi-tenant.
 * 
 * Aturan Pagar:
 * 1. Meredaksi field rahasia: authorization, password, token, secret, apiKey, privateKey, cookie, smtp_pass.
 * 2. Menyertakan context binding: requestId dan orgId.
 * 3. Tidak membocorkan stack trace mentah atau teks SQL sensitif di log produksi.
 */

import crypto from 'node:crypto';
import pino from 'pino';

export const REDACT_PATHS = [
  'authorization',
  'password',
  'token',
  'secret',
  'apiKey',
  'privateKey',
  'cookie',
  'client_secret',
  'access_token',
  'refresh_token',
  'GOOGLE_CLIENT_SECRET',
  'google_client_secret',
  'googleClientSecret',
  'api_key',
  'SMTP_PASS',
  'smtp_pass',
  'smtpPass',
  'smtp',
  'smtp.pass',
  'smtp.auth.pass',
  'JOBENPAY_ENC_KEY',
  'JOBENPAY_LEDGER_SIGNING_KEY',
  'req.headers.authorization',
  'req.headers.cookie',
  '*.authorization',
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.api_key',
  '*.privateKey',
  '*.private_key',
  '*.cookie',
  'err.message',
  'err.stack',
  'err.cause',
];

function redactEncryptedAndSensitiveFields(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => redactEncryptedAndSensitiveFields(entry));
  }
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/_enc$/i.test(key)
        && !/(?:password|secret|token|api[_-]?key|private[_-]?key|authorization|cookie|smtp)/i.test(key))
      .map(([key, entry]) => [key, redactEncryptedAndSensitiveFields(entry)]),
  );
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: undefined,
  redact: {
    paths: REDACT_PATHS,
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
      return redactEncryptedAndSensitiveFields(object);
    },
    level(label) {
      return { level: label };
    },
  },
});

/**
 * Membuat child logger dengan orgId dan requestId
 */
export function createTenantLogger(orgId, requestId = crypto.randomUUID()) {
  return logger.child({ orgId, requestId });
}

/**
 * Middleware Express untuk memasang req.id dan req.log
 */
export function attachRequestLogger(req, res, next) {
  const requestId = req.headers['x-request-id'] ?? crypto.randomUUID();
  req.id = String(requestId);
  res.setHeader('x-request-id', req.id);

  const orgId = req.session?.orgId || req.orgId || undefined;
  req.log = logger.child({ requestId: req.id, ...(orgId ? { orgId } : {}) });

  next();
}

export default logger;

