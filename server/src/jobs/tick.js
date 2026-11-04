import { pathToFileURL } from 'node:url';

import pool from '../db/pool.js';
import { enqueue, claimNext } from './queue.js';
import { executeClaimedJob } from './worker.js';
import { logger } from '../lib/logger.js';
import { scheduleApprovalExpiry } from './expireApprovals.js';
import { scheduleDemoReset } from './resetDemoData.js';

const DEFAULT_MAX_DURATION_MS = 55_000;

function getMaxDurationMs() {
  const configured = Number(process.env.JOB_TICK_MAX_DURATION_MS ?? DEFAULT_MAX_DURATION_MS);
  if (!Number.isInteger(configured) || configured < 1 || configured > DEFAULT_MAX_DURATION_MS) {
    throw new TypeError(`JOB_TICK_MAX_DURATION_MS must be an integer between 1 and ${DEFAULT_MAX_DURATION_MS}.`);
  }
  return configured;
}

export async function updateTickHeartbeat(dbOrPool = pool) {
  await dbOrPool.query(`
    INSERT INTO jobs (type, payload, run_at, dedupe_key, status)
    VALUES ('_tick_heartbeat', '{"process":"tick"}', now(), '_tick_heartbeat', 'COMPLETED')
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL
    DO UPDATE SET
      created_at = now(),
      run_at = now(),
      payload = EXCLUDED.payload,
      status = 'COMPLETED',
      locked_until = NULL,
      last_error = NULL
  `);
}

export async function getProcessorHealth(dbOrPool = pool) {
  const result = await dbOrPool.query(`
    SELECT
      (SELECT extract(epoch FROM (now() - run_at))::integer
       FROM jobs WHERE dedupe_key = '_worker_heartbeat' LIMIT 1) AS worker_heartbeat_age_sec,
      (SELECT extract(epoch FROM (now() - run_at))::integer
       FROM jobs WHERE dedupe_key = '_tick_heartbeat' LIMIT 1) AS tick_heartbeat_age_sec,
      (SELECT coalesce(extract(epoch FROM (now() - min(run_at)))::integer, 0)
       FROM jobs
       WHERE status = 'PENDING'
         AND type NOT IN ('_worker_heartbeat', '_tick_heartbeat', 'cleanup')) AS oldest_pending_job_age_sec,
      (SELECT count(*)::integer
       FROM jobs
       WHERE status = 'DEAD'
         AND type NOT IN ('_worker_heartbeat', '_tick_heartbeat')) AS dead_jobs
  `);

  const row = result.rows[0] || {};
  return {
    workerHeartbeatAgeSec: row.worker_heartbeat_age_sec === null ? null : Math.max(0, Number(row.worker_heartbeat_age_sec)),
    tickHeartbeatAgeSec: row.tick_heartbeat_age_sec === null ? null : Math.max(0, Number(row.tick_heartbeat_age_sec)),
    oldestPendingJobAgeSec: Math.max(0, Number(row.oldest_pending_job_age_sec || 0)),
    deadJobs: Math.max(0, Number(row.dead_jobs || 0)),
  };
}

export async function drainQueue({ maxDurationMs = getMaxDurationMs() } = {}) {
  if (!Number.isInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > DEFAULT_MAX_DURATION_MS) {
    throw new TypeError(`maxDurationMs must be between 1 and ${DEFAULT_MAX_DURATION_MS}.`);
  }

  await updateTickHeartbeat(pool);

  const deadline = Date.now() + maxDurationMs;
  await enqueue(pool, {
    type: 'cleanup',
    payload: {},
    dedupeKey: 'job:cleanup-hourly',
  });
  await scheduleApprovalExpiry(pool);
  await scheduleDemoReset(pool);

  while (Date.now() < deadline) {
    await updateTickHeartbeat(pool);
    const [job] = await claimNext(1);
    if (!job) {
      break;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }
    let timer;
    await Promise.race([
      executeClaimedJob(job),
      new Promise((resolve) => {
        timer = setTimeout(resolve, remaining);
      }),
    ]);
    clearTimeout(timer);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const maxDurationMs = getMaxDurationMs();
  const hardStop = setTimeout(() => {
    logger.info('Job tick reached its duration limit.');
    process.exit(0);
  }, maxDurationMs);

  drainQueue({ maxDurationMs }).then(async () => {
    clearTimeout(hardStop);
    await pool.end();
    process.exitCode = 0;
  }).catch(async (error) => {
    clearTimeout(hardStop);
    logger.error({ err: error }, 'Job tick failed');
    await pool.end();
    process.exitCode = 1;
  });
}
