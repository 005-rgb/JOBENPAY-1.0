import { AppError } from './errors.js';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export function parsePage({ limit, cursor } = {}) {
  const parsedLimit = limit == null || limit === '' ? DEFAULT_LIMIT : Number(limit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_LIMIT) {
    const error = new AppError('VALIDATION_FAILED', `limit must be an integer from 1 to ${MAX_LIMIT}.`);
    error.statusCode = 400;
    throw error;
  }

  if (cursor == null || cursor === '') return { limit: parsedLimit, cursor: null };
  try {
    const decoded = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (typeof decoded.createdAt !== 'string'
      || Number.isNaN(Date.parse(decoded.createdAt))
      || typeof decoded.id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decoded.id)) {
      throw new Error('Invalid cursor shape.');
    }
    return { limit: parsedLimit, cursor: decoded };
  } catch {
    const error = new AppError('VALIDATION_FAILED', 'cursor is invalid.');
    error.statusCode = 400;
    throw error;
  }
}

export function encodeCursor(row) {
  const createdAt = row?.cursor_created_at ?? row?.created_at;
  if (!createdAt || !row?.id) return null;
  return Buffer.from(JSON.stringify({
    createdAt: String(createdAt),
    id: row.id,
  })).toString('base64url');
}

export function pageResult(rows, limit) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    nextCursor: hasMore ? encodeCursor(items.at(-1)) : null,
  };
}
