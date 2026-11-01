import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

import { runMigrations } from '../../scripts/migrate.js';
import { claimNext, complete, enqueue, fail, heartbeat, queueStats } from '../../src/jobs/queue.js';
import { runCleanup } from '../../src/jobs/cleanup.js';

const connectionString = process.env.TEST_DATABASE_URL;
const hasDatabaseEnv = Boolean(connectionString);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const childScript = path.resolve(testDirectory, '../helpers/jobWorkerChild.js');
const tickScript = path.resolve(testDirectory, '../../src/jobs/tick.js');

function waitForChildLine(child, expected, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${expected}. Output: ${output}`)), timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes(expected)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      if (code !== null) {
        clearTimeout(timer);
        reject(new Error(`Worker child exited with code ${code}. Output: ${output}`));
      }
    });
  });
}

async function waitForStatus(db, jobId, status, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await db.query('SELECT status FROM jobs WHERE id = $1', [jobId]);
    if (result.rows[0]?.status === status) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Job ${jobId} did not reach ${status}.`);
}

async function accelerateRetriesUntilDead(db, jobId, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await db.query('SELECT status, attempts FROM jobs WHERE id = $1', [jobId]);
    const job = result.rows[0];
    if (job?.status === 'DEAD') {
      return job;
    }
    if (job?.status === 'PENDING') {
      await db.query("UPDATE jobs SET run_at = now() WHERE id = $1 AND status = 'PENDING'", [jobId]);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Job ${jobId} did not reach DEAD after retries.`);
}

test('PostgreSQL jobs are deduplicated, claimed once, retried, recovered, and drained', {
  skip: !hasDatabaseEnv,
}, async () => {
  const schema = `job_queue_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);

  const options = new URLSearchParams({ options: `-c search_path=${schema},public` });
  const separator = connectionString.includes('?') ? '&' : '?';
  const isolatedConnectionString = `${connectionString}${separator}${options.toString()}`;
  const db = new pg.Pool({ connectionString: isolatedConnectionString });
  let firstWorker;
  let secondWorker;
  let stubWorker;
  let failingWorker;

  try {
    await runMigrations(isolatedConnectionString);

    const seen = new Map();
    for (let index = 0; index < 50; index += 1) {
      await enqueue(db, {
        type: 'execute_request',
        payload: { index },
        dedupeKey: `parallel-${randomUUID()}`,
      });
    }

    const simulateWorker = async () => {
      while (true) {
        const [job] = await claimNext(1, db);
        if (!job) {
          return;
        }
        seen.set(job.id, (seen.get(job.id) || 0) + 1);
        await complete(job.id, db);
      }
    };
    await Promise.all([
      simulateWorker(),
      simulateWorker(),
      simulateWorker(),
      simulateWorker(),
    ]);
    assert.equal(seen.size, 50);
    assert.ok([...seen.values()].every((count) => count === 1));

    const dedupeKey = `dedupe-${randomUUID()}`;
    const first = await enqueue(db, { type: 'send_email', dedupeKey });
    const duplicate = await enqueue(db, { type: 'send_email', dedupeKey });
    assert.equal(duplicate.id, first.id);
    const [dedupeClaim] = await claimNext(1, db);
    assert.equal(dedupeClaim.id, first.id);
    await complete(first.id, db);

    const stale = await enqueue(db, { type: 'reconcile_request' });
    const [initialClaim] = await claimNext(1, db);
    assert.equal(initialClaim.id, stale.id);
    await heartbeat(stale.id, db);
    await db.query("UPDATE jobs SET locked_until = now() - interval '1 second' WHERE id = $1", [stale.id]);
    const [reclaimed] = await claimNext(1, db);
    assert.equal(reclaimed.id, stale.id);
    assert.equal(reclaimed.attempts, 2);
    assert.deepEqual(await claimNext(1, db), []);
    await complete(stale.id, db);

    const retry = await enqueue(db, { type: 'process_webhook' });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const [job] = await claimNext(1, db);
      assert.equal(job.id, retry.id);
      const failedAt = Date.now();
      const failed = await fail(job.id, new Error('test failure'), {}, db);
      assert.equal(failed.status, attempt === 5 ? 'DEAD' : 'PENDING');
      if (attempt < 5) {
        const delayResult = await db.query(
          "SELECT extract(epoch FROM ($1::timestamptz - now())) * 1000 AS delay_ms",
          [failed.run_at],
        );
        const delay = Number(delayResult.rows[0].delay_ms) + (Date.now() - failedAt);
        const expectedMinimum = 500 * (2 ** (attempt - 1));
        const expectedMaximum = 1500 * (2 ** (attempt - 1));
        assert.ok(delay >= expectedMinimum - 100, `retry delay ${delay}ms was too short`);
        assert.ok(delay <= expectedMaximum + 100, `retry delay ${delay}ms was too long`);
        await db.query('UPDATE jobs SET run_at = now() WHERE id = $1', [retry.id]);
      }
    }

    const unimplemented = await enqueue(db, { type: 'extract_document' });
    const [unimplementedClaim] = await claimNext(1, db);
    assert.equal(unimplementedClaim.id, unimplemented.id);
    const dead = await fail(unimplemented.id, Object.assign(new Error('NOT_IMPLEMENTED'), {
      code: 'NOT_IMPLEMENTED',
    }), {}, db);
    assert.equal(dead.status, 'DEAD');

    const handlerFailure = await enqueue(db, {
      type: 'execute_request',
      runAt: new Date('2000-01-01T00:00:00.000Z'),
    });
    failingWorker = spawn(process.execPath, [childScript], {
      env: {
        ...process.env,
        DATABASE_URL: isolatedConnectionString,
        JOB_TEST_JOB_ID: handlerFailure.id,
        JOB_TEST_MODE: 'throw',
        WORKER_ENABLED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const handlerDead = await accelerateRetriesUntilDead(db, handlerFailure.id);
    assert.equal(handlerDead.attempts, 5);
    assert.equal(failingWorker.exitCode, null);
    failingWorker.kill('SIGKILL');
    await once(failingWorker, 'close');
    failingWorker = null;

    const stubJob = await enqueue(db, {
      type: 'extract_document',
      runAt: new Date('2000-01-01T00:00:00.000Z'),
    });
    stubWorker = spawn(process.execPath, [childScript], {
      env: {
        ...process.env,
        DATABASE_URL: isolatedConnectionString,
        JOB_TEST_JOB_ID: randomUUID(),
        JOB_TEST_MODE: 'finish',
        WORKER_ENABLED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stubDead = await accelerateRetriesUntilDead(db, stubJob.id);
    assert.equal(stubDead.attempts, 5);
    assert.equal(stubWorker.exitCode, null);
    stubWorker.kill('SIGKILL');
    await once(stubWorker, 'close');
    stubWorker = null;

    const restartJob = await enqueue(db, {
      type: 'execute_request',
      runAt: new Date('2000-01-01T00:00:00.000Z'),
      dedupeKey: `restart-${randomUUID()}`,
    });
    const childEnv = {
      ...process.env,
      DATABASE_URL: isolatedConnectionString,
      JOB_TEST_JOB_ID: restartJob.id,
      JOB_TEST_MODE: 'hold',
      WORKER_ENABLED: '1',
    };
    firstWorker = spawn(process.execPath, [childScript], {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForChildLine(firstWorker, 'TARGET_JOB_STARTED');
    firstWorker.kill('SIGKILL');
    await once(firstWorker, 'close');
    firstWorker = null;

    await db.query("UPDATE jobs SET locked_until = now() - interval '1 second' WHERE id = $1", [restartJob.id]);
    secondWorker = spawn(process.execPath, [childScript], {
      env: { ...childEnv, JOB_TEST_MODE: 'finish' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForStatus(db, restartJob.id, 'COMPLETED');
    secondWorker.kill('SIGKILL');
    await once(secondWorker, 'close');
    secondWorker = null;

    await db.query(`
      INSERT INTO rate_limit_buckets (key, window_start, count)
      VALUES ('expired-test-bucket', now() - interval '2 days', 1)
    `);
    await db.query(`
      INSERT INTO sessions (id_hash, user_id, csrf_secret, expires_at)
      VALUES ('expired-test-session', gen_random_uuid(), 'csrf', now() - interval '1 day')
    `);
    await db.query(`
      INSERT INTO jobs (type, status, created_at, run_at)
      VALUES ('send_email', 'COMPLETED', now() - interval '8 days', now() - interval '8 days')
    `);
    const cleanup = await enqueue(db, {
      type: 'cleanup',
      dedupeKey: `cleanup-test-${randomUUID()}`,
    });
    const [claimedCleanup] = await claimNext(1, db);
    assert.equal(claimedCleanup.id, cleanup.id);
    const cleanupClient = await db.connect();
    try {
      await cleanupClient.query('BEGIN');
      await runCleanup(claimedCleanup, { db: cleanupClient });
      await cleanupClient.query('COMMIT');
    } catch (error) {
      await cleanupClient.query('ROLLBACK');
      throw error;
    } finally {
      cleanupClient.release();
    }

    const cleanupState = await db.query('SELECT status, run_at FROM jobs WHERE id = $1', [cleanup.id]);
    assert.equal(cleanupState.rows[0].status, 'PENDING');
    assert.ok(new Date(cleanupState.rows[0].run_at).getTime() > Date.now() + 59 * 60 * 1000);
    assert.equal((await db.query("SELECT 1 FROM rate_limit_buckets WHERE key = 'expired-test-bucket'")).rowCount, 0);
    assert.equal((await db.query("SELECT 1 FROM sessions WHERE id_hash = 'expired-test-session'")).rowCount, 0);
    assert.equal((await db.query("SELECT 1 FROM jobs WHERE created_at < now() - interval '7 days' AND status = 'COMPLETED'")).rowCount, 0);

    const stats = await queueStats(null, db);
    assert.equal(stats.dead, 4);
    assert.equal(stats.oldestUnprocessedWebhookAgeSeconds, null);
    await db.query(`
      INSERT INTO webhook_events (org_id, event_type, status, received_at)
      VALUES (gen_random_uuid(), 'TEST.EVENT', 'RECEIVED', now() - interval '2 hours')
    `);
    const webhookStats = await queueStats(null, db);
    assert.ok(webhookStats.oldestUnprocessedWebhookAgeSeconds >= 7190);

    const metricsOrgId = randomUUID();
    await enqueue(db, {
      type: 'send_email',
      orgId: metricsOrgId,
      dedupeKey: `metrics-${randomUUID()}`,
    });
    const scopedStats = await queueStats(metricsOrgId, db);
    assert.equal(scopedStats.depth, 1);
    assert.equal(scopedStats.dead, 0);
    assert.equal(scopedStats.oldestUnprocessedWebhookAgeSeconds, null);

    const tickStartedAt = Date.now();
    const tick = spawn(process.execPath, [tickScript], {
      env: {
        ...process.env,
        DATABASE_URL: isolatedConnectionString,
        JOB_TICK_MAX_DURATION_MS: '5000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const [tickCode] = await once(tick, 'close');
    assert.equal(tickCode, 0);
    assert.ok(Date.now() - tickStartedAt < 4500);
  } finally {
    for (const child of [firstWorker, secondWorker, stubWorker, failingWorker]) {
      if (child && child.exitCode === null) {
        child.kill('SIGKILL');
        await once(child, 'close');
      }
    }
    await db.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
