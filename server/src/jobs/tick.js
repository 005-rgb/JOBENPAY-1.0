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

export async function drainQueue({ maxDurationMs = getMaxDurationMs() } = {}) {
  if (!Number.isInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > DEFAULT_MAX_DURATION_MS) {
    throw new TypeError(`maxDurationMs must be between 1 and ${DEFAULT_MAX_DURATION_MS}.`);
  }

  const deadline = Date.now() + maxDurationMs;
  await enqueue(pool, {
    type: 'cleanup',
    payload: {},
    dedupeKey: 'job:cleanup-hourly',
  });
  await scheduleApprovalExpiry(pool);
  await scheduleDemoReset(pool);

  while (Date.now() < deadline) {
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
