import crypto from 'node:crypto';

export class AppError extends Error {
  constructor(code, message, details = undefined) {
    super(message ?? code);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export function formatError(error, requestId = crypto.randomUUID()) {
  const code = error?.code ?? 'INTERNAL';
  const message = error?.message ?? 'Internal server error.';
  return {
    error: {
      code,
      message,
      requestId,
      details: error?.details ?? undefined,
    },
  };
}

export function errorHandler(error, _req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  const requestId = _req?.id ?? crypto.randomUUID();

  const appError = error instanceof AppError
    ? error
    : new AppError(error?.code ?? 'INTERNAL', error?.message ?? 'Internal server error.', error?.details);

  appError.statusCode = error?.statusCode ?? appError.statusCode ?? 500;
  const payload = formatError(appError, requestId);
  res.status(appError.statusCode).json(payload);
}
