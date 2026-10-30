import pool from '../db/pool.js';
import { JOB_TYPES } from './registry.js';

const DEFAULT_MAX_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

function assertJobType(type) {
  if (!JOB_TYPES.includes(type)) {
    throw new TypeError(`Unsupported job type: ${type}`);
  }
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message.slice(0, 2000);
  }
  return String(error).slice(0, 2000);
}

export async function enqueue(dbOrPool, {
  type,
  payload = {},
  runAt = new Date(),
  dedupeKey,
} = {}) {
  assertJobType(type);
  const db = dbOrPool || pool;
  const result = await db.query(`
    INSERT INTO jobs (type, payload, run_at, dedupe_key, status)
    VALUES ($1, $2, $3, $4, 'PENDING')
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING *
  `, [type, payload, runAt, dedupeKey ?? null]);

  if (result.rowCount > 0) {
    return result.rows[0];
  }

  if (dedupeKey == null) {
    throw new Error('Job insert did not return a row.');
  }

  const existing = await db.query('SELECT * FROM jobs WHERE dedupe_key = $1', [dedupeKey]);
  if (existing.rowCount === 0) {
    throw new Error('Job deduplication conflict could not be resolved.');
  }
  return existing.rows[0];
}

export async function claimNext(limit = 1, dbOrPool = pool) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError('Claim limit must be a positive integer.');
  }

  const result = await dbOrPool.query(`
    WITH candidates AS (
      SELECT id
      FROM jobs
      WHERE (
        (status = 'PENDING' AND run_at <= now())
        OR (status = 'RUNNING' AND (locked_until IS NULL OR locked_until < now()))
      )
      AND (locked_until IS NULL OR locked_until < now())
      ORDER BY run_at, created_at
      FOR UPDATE SKIP LOCKED
      LIMIT $1
    )
    UPDATE jobs AS job
    SET status = 'RUNNING',
        locked_until = now() + interval '60 seconds',
        attempts = job.attempts + 1
    FROM candidates
    WHERE job.id = candidates.id
    RETURNING job.*
  `, [limit]);

  return result.rows;
}

export async function heartbeat(jobId, dbOrPool = pool) {
  const result = await dbOrPool.query(`
    UPDATE jobs
    SET locked_until = now() + interval '60 seconds'
    WHERE id = $1 AND status = 'RUNNING'
    RETURNING id
  `, [jobId]);
  if (result.rowCount !== 1) {
    throw new Error(`Cannot heartbeat job ${jobId}: it is not running.`);
  }
}

export async function complete(jobId, dbOrPool = pool) {
  const result = await dbOrPool.query(`
    UPDATE jobs
    SET status = 'COMPLETED', locked_until = NULL, last_error = NULL
    WHERE id = $1 AND status = 'RUNNING'
    RETURNING *
  `, [jobId]);
  if (result.rowCount !== 1) {
    const current = await dbOrPool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    if (current.rows[0]?.status === 'PENDING' && current.rows[0]?.type === 'cleanup') {
      return current.rows[0];
    }
    throw new Error(`Cannot complete job ${jobId}: it is not running.`);
  }
  return result.rows[0];
}

export async function fail(jobId, error, { retryAt, maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}, dbOrPool = pool) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new TypeError('maxAttempts must be a positive integer.');
  }

  const retryDate = retryAt == null ? null : new Date(retryAt);
  if (retryDate && Number.isNaN(retryDate.getTime())) {
    throw new TypeError('retryAt must be a valid date.');
  }
  const message = getErrorMessage(error);
  const result = await dbOrPool.query(`
    UPDATE jobs
    SET status = CASE
          WHEN $2 OR attempts >= $3 THEN 'DEAD'
          ELSE 'PENDING'
        END,
        run_at = CASE
          WHEN $2 OR attempts >= $3 THEN run_at
          WHEN $4::timestamptz IS NOT NULL THEN $4
          ELSE now() + (
            LEAST(
              $5::double precision,
              $6::double precision
                * power(2::double precision, GREATEST(attempts - 1, 0))
                * (0.5 + random())
            )
            * interval '1 millisecond'
          )
        END,
        locked_until = NULL,
        last_error = $7
    WHERE id = $1 AND status = 'RUNNING'
    RETURNING *
  `, [
    jobId,
    error?.code === 'NOT_IMPLEMENTED',
    maxAttempts,
    retryDate,
    MAX_RETRY_DELAY_MS,
    BASE_RETRY_DELAY_MS,
    message,
  ]);
  if (result.rowCount !== 1) {
    throw new Error(`Cannot fail job ${jobId}: it is no longer running.`);
  }
  return result.rows[0];
}

export async function queueStats(dbOrPool = pool) {
  const [statuses, webhook] = await Promise.all([
    dbOrPool.query(`
      SELECT status, count(*)::integer AS count
      FROM jobs
      WHERE type <> '_worker_heartbeat'
      GROUP BY status
    `),
    dbOrPool.query(`
      SELECT extract(epoch FROM (now() - min(coalesce(received_at, created_at))))::integer AS age_seconds
      FROM webhook_events
      WHERE processed_at IS NULL
    `),
  ]);

  const byStatus = { PENDING: 0, RUNNING: 0, COMPLETED: 0, DEAD: 0 };
  for (const row of statuses.rows) {
    if (Object.hasOwn(byStatus, row.status)) {
      byStatus[row.status] = Number(row.count);
    }
  }

  return {
    byStatus,
    dead: byStatus.DEAD,
    oldestUnprocessedWebhookAgeSeconds: webhook.rows[0].age_seconds == null
      ? null
      : Number(webhook.rows[0].age_seconds),
  };
}

export { DEFAULT_MAX_ATTEMPTS };
