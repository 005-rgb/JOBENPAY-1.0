/**
 * server/src/errors.js
 * Hierarki error terstruktur (AppError) dan penangan error Express 5.
 * 
 * Aturan Pagar:
 * 1. Mendukung signature:
 *    - new AppError(code, message, details) [kompatibel dengan seluruh basis kode]
 *    - new AppError(code, httpStatus, messageEn, messageId, details) [spesifikasi lengkap B-F1]
 * 2. Error handler Express tidak pernah membocorkan stack trace atau query SQL mentah ke klien.
 * 3. Menyertakan requestId di setiap respon error untuk pelacakan log audit.
 */

import crypto from 'node:crypto';
import { ERROR_CODES } from '../../shared/error-codes.js';

export class AppError extends Error {
  /**
   * @param {string} code - Kode error mesin
   * @param {number|string} [httpStatusOrMessage=500] - Status HTTP atau pesan error
   * @param {string|*} [messageEnOrDetails=undefined] - Pesan EN atau objek details
   * @param {string} [messageId=''] - Pesan ID
   * @param {*} [details=undefined] - Objek detail error
   */
  constructor(code, httpStatusOrMessage, messageEnOrDetails = undefined, messageId = '', details = undefined) {
    let resolvedStatus = 500;
    let resolvedMessageEn = code;
    let resolvedMessageId = '';
    let resolvedDetails = undefined;

    if (typeof httpStatusOrMessage === 'number') {
      // Dipanggil dengan signature (code, httpStatus, messageEn, messageId, details)
      resolvedStatus = httpStatusOrMessage;
      resolvedMessageEn = typeof messageEnOrDetails === 'string' ? messageEnOrDetails : code;
      resolvedMessageId = messageId || resolvedMessageEn;
      resolvedDetails = details;
    } else {
      // Dipanggil dengan signature (code, message, details)
      resolvedMessageEn = typeof httpStatusOrMessage === 'string' ? httpStatusOrMessage : code;
      resolvedMessageId = resolvedMessageEn;
      resolvedDetails = messageEnOrDetails !== undefined ? messageEnOrDetails : details;

      // Cari status dari kamus ERROR_CODES kanonik
      if (ERROR_CODES[code]?.httpStatus) {
        resolvedStatus = ERROR_CODES[code].httpStatus;
      } else {
        resolvedStatus = 500;
      }
    }

    super(resolvedMessageEn);
    this.name = this.constructor.name;
    this.code = code;
    this.httpStatus = resolvedStatus;
    this.statusCode = resolvedStatus;
    this.messageEn = resolvedMessageEn;
    this.messageId = resolvedMessageId;
    this.details = resolvedDetails;
  }
}

export class ValidationError extends AppError {
  constructor(messageEn = 'Validation failed.', details = undefined, messageId = 'Validasi gagal.') {
    super('VALIDATION_FAILED', 400, messageEn, messageId, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(messageEn = 'Authentication required.', details = undefined, messageId = 'Autentikasi diperlukan.') {
    super('UNAUTHENTICATED', 401, messageEn, messageId, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(messageEn = 'Forbidden.', details = undefined, messageId = 'Akses ditolak.') {
    super('FORBIDDEN', 403, messageEn, messageId, details);
  }
}

export class NotFoundError extends AppError {
  constructor(messageEn = 'Resource not found.', details = undefined, messageId = 'Sumber daya tidak ditemukan.') {
    super('NOT_FOUND', 404, messageEn, messageId, details);
  }
}

export class ConflictError extends AppError {
  constructor(messageEn = 'Resource conflict or illegal transition.', code = 'CONFLICT', details = undefined, messageId = 'Konflik status sumber daya.') {
    super(code, 409, messageEn, messageId, details);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(messageEn = 'Unprocessable entity or policy violation.', code = 'UNPROCESSABLE_ENTITY', details = undefined, messageId = 'Permintaan tidak dapat diproses.') {
    super(code, 422, messageEn, messageId, details);
  }
}

export class RateLimitedError extends AppError {
  constructor(messageEn = 'Rate limit exceeded.', details = undefined, messageId = 'Batas laju permintaan terlampaui.') {
    super('RATE_LIMITED', 429, messageEn, messageId, details);
  }
}

export class UpstreamError extends AppError {
  constructor(messageEn = 'Upstream provider error or unavailable.', code = 'UPSTREAM_ERROR', details = undefined, messageId = 'Layanan penyedia upstream bermasalah.') {
    super(code, 502, messageEn, messageId, details);
  }
}

export class InternalError extends AppError {
  constructor(messageEn = 'Internal server error.', details = undefined, messageId = 'Terjadi kesalahan internal server.') {
    super('INTERNAL', 500, messageEn, messageId, details);
  }
}

/**
 * Memformat objek error menjadi respons JSON aman tanpa stack trace / SQL
 */
export function formatError(error, requestId = crypto.randomUUID()) {
  const code = error?.code || 'INTERNAL';
  const message = error?.message || (error instanceof AppError ? error.messageEn : 'Internal server error.');
  const details = error?.details;

  return {
    error: {
      code,
      message,
      requestId,
      details,
    },
  };
}

/**
 * Middleware Express 5 Error Handler terpusat
 */
export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  const requestId = req?.id || req?.headers?.['x-request-id'] || crypto.randomUUID();

  let appError;
  if (error instanceof AppError) {
    appError = error;
  } else if (error?.type === 'entity.parse.failed') {
    appError = new ValidationError('Malformed JSON in request body.');
  } else {
    appError = new InternalError('Internal server error.');
  }

  const statusCode = appError.statusCode || appError.httpStatus || 500;
  const payload = formatError(appError, requestId);

  res.status(statusCode).json(payload);
}

export default AppError;
