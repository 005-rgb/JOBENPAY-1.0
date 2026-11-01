import { clearInterval, setInterval } from 'node:timers';

import pool from '../db/pool.js';
import { enqueue, heartbeat, complete, fail, claimNext } from './queue.js';
import { getHandler } from './registry.js';
import { logger } from '../lib/logger.js';
import { scheduleApprovalExpiry } from './expireApprovals.js';
import { scheduleDemoReset } from './resetDemoData.js';

const WORKER_CONCURRENCY = 2;
const PROCESS_HEARTBEAT_MS = 10_000;

export async function executeClaimedJob(job) {
  const handler = getHandler(job.type);
  const heartbeatTimer = setInterval(() => {
    heartbeat(job.id).catch((error) => {
      logger.error({ err: error, jobId: job.id }, 'Job heartbeat failed');
    });
  }, 20_000);
  heartbeatTimer.unref();

  try {
    if (job.org_id) {
      const organization = await pool.query(
        'SELECT archived_at FROM organizations WHERE id = $1',
        [job.org_id],
      );
      if (organization.rows[0]?.archived_at) {
        await complete(job.id);
        return;
      }
    }
    await handler(job, {
      db: pool,
      heartbeat: () => heartbeat(job.id),
    });
    await complete(job.id);
  } catch (error) {
    logger.error({ err: error, jobId: job.id, type: job.type }, 'Job handler failed');
    await fail(job.id, error).catch((failureError) => {
      logger.error({ err: failureError, jobId: job.id }, 'Could not record job failure');
    });
  } finally {
    clearInterval(heartbeatTimer);
  }
}

export function startWorker({
  pollIntervalMs = 2000,
  pollJitterMs = 500,
  heartbeatIntervalMs = PROCESS_HEARTBEAT_MS,
} = {}) {
  let stopping = false;
  let wakePoll = null;
  const active = new Set();

  const updateProcessHeartbeat = async () => {
    await pool.query(`
      INSERT INTO jobs (type, payload, run_at, dedupe_key, status)
      VALUES ('_worker_heartbeat', '{}', now(), '_worker_heartbeat', 'COMPLETED')
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL
      DO UPDATE SET
        created_at = now(),
        run_at = now(),
        payload = EXCLUDED.payload,
        status = 'COMPLETED',
        locked_until = NULL,
        last_error = NULL
    `);
  };

  const heartbeatTimer = setInterval(() => {
    updateProcessHeartbeat().catch((error) => {
      logger.error({ err: error }, 'Worker process heartbeat failed');
    });
  }, heartbeatIntervalMs);
  heartbeatTimer.unref();

  const waitForPoll = (milliseconds) => new Promise((resolve) => {
    const timer = setTimeout(() => {
      wakePoll = null;
      resolve();
    }, milliseconds);
    wakePoll = () => {
      clearTimeout(timer);
      wakePoll = null;
      resolve();
    };
  });

  const run = async () => {
    while (!stopping) {
      try {
        await updateProcessHeartbeat();
        await enqueue(pool, {
          type: 'cleanup',
          payload: {},
          dedupeKey: 'job:cleanup-hourly',
        });
        await scheduleApprovalExpiry(pool);
        await scheduleDemoReset(pool);

        const slots = WORKER_CONCURRENCY - active.size;
        if (slots > 0) {
          const jobs = await claimNext(slots);
          for (const job of jobs) {
            const task = executeClaimedJob(job);
            active.add(task);
            task.then(() => active.delete(task));
          }
          if (jobs.length > 0) {
            continue;
          }
        } else {
          await Promise.race(active);
          continue;
        }
      } catch (error) {
        logger.error({ err: error }, 'Worker poll failed');
      }

      if (!stopping) {
        const jitter = Math.floor(Math.random() * (pollJitterMs + 1));
        await waitForPoll(pollIntervalMs + jitter);
      }
    }

    await Promise.all(active);
  };

  const done = run();
  return {
    done,
    async stop() {
      stopping = true;
      clearInterval(heartbeatTimer);
      wakePoll?.();
      await done;
    },
  };
}
