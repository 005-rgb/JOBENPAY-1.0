import { query } from '../db/pool.js';
import { AppError } from '../lib/errors.js';

export async function rateLimit(key, limit, windowSec) {
  if (!key || !limit || !windowSec) {
    throw new Error('rateLimit requires key, limit, and windowSec.');
  }

  const windowStart = new Date(Math.floor(Date.now() / 1000 / windowSec) * windowSec * 1000).toISOString();
  const result = await query(
    `INSERT INTO rate_limit_buckets (key, window_start, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (key, window_start)
     DO UPDATE SET count = rate_limit_buckets.count + 1
     RETURNING count`,
    [String(key), windowStart],
  );

  const currentCount = Number(result.rows[0].count);
  return currentCount > Number(limit);
}

export async function enforceRateLimit(key, limit, windowSec) {
  const exceeded = await rateLimit(key, limit, windowSec);
  if (exceeded) {
    const err = new AppError('RATE_LIMITED', 'Rate limit exceeded.');
    err.statusCode = 429;
    throw err;
  }
}

export default {
  rateLimit,
  enforceRateLimit,
};
