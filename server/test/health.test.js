import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { startServer } from '../src/server.js';
import { env } from '../src/config.js';
import { closeTestApp, startTestApp } from './helpers/testApp.js';
import { runMigrations } from '../scripts/migrate.js';
import pool from '../src/db/pool.js';

test('GET /healthz returns 200', async () => {
  const server = startServer(0);
  await once(server, 'listening');
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.service, 'jobenpay');
  assert.equal(body.status, 'healthy');

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

test('GET /readyz reports readiness only when database prerequisites are met', async () => {
  const server = startServer(0);
  await once(server, 'listening');
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/readyz`);
  const body = await response.json();
  if (response.status === 200) {
    assert.equal(body.status, 'ready');
    assert.equal(body.ok, true);
  } else {
    assert.equal(response.status, 503);
    assert.equal(body.status, 'not_ready');
    assert.equal(body.ok, false);
  }

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

test('GET /readyz is unavailable when the worker heartbeat is stale', {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  await runMigrations(process.env.TEST_DATABASE_URL);
  const previousWorkerEnabled = env.WORKER_ENABLED;
  const priorHeartbeat = await pool.query(`
    SELECT id, run_at
    FROM jobs
    WHERE type = '_worker_heartbeat' AND dedupe_key = '_worker_heartbeat'
    LIMIT 1
  `);
  if (priorHeartbeat.rowCount) {
    await pool.query(
      'UPDATE jobs SET run_at = now() - interval \'1 hour\' WHERE id = $1',
      [priorHeartbeat.rows[0].id],
    );
  }
  env.WORKER_ENABLED = 1;
  const { server, url } = await startTestApp();
  try {
    const response = await fetch(`${url}/readyz`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).status, 'not_ready');
  } finally {
    env.WORKER_ENABLED = previousWorkerEnabled;
    if (priorHeartbeat.rowCount) {
      await pool.query('UPDATE jobs SET run_at = $2 WHERE id = $1', [
        priorHeartbeat.rows[0].id,
        priorHeartbeat.rows[0].run_at,
      ]);
    }
    await closeTestApp(server);
  }
});
