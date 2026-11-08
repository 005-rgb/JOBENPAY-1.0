// @ts-check
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { worker } from '../jobs/worker.js';
import { migrationStatus } from '../db/migrations.js';
import { logger } from '../lib/logger.js';
import { env } from '../config.js';

export const healthRouter = Router();

// Liveness: hanya cek process alive
healthRouter.get('/healthz', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'jobenpay',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Readiness: cek DB, migrasi, worker heartbeat
healthRouter.get('/readyz', async (_req, res) => {
  const checks = {
    database: false,
    migrations: false,
    worker_heartbeat: false,
  };

  try {
    const dbResult = await pool.query('SELECT 1 as ping');
    checks.database = dbResult.rowCount === 1;
  } catch (err) {
    logger.warn({ err }, 'Readiness check: database failed');
  }

  try {
    checks.migrations = await migrationStatus();
  } catch (err) {
    logger.warn({ err }, 'Readiness check: migrationStatus failed');
  }

  try {
    if (env.WORKER_ENABLED === 1) {
      const heartbeat = await pool.query(`
        SELECT 1
        FROM jobs
        WHERE type = '_worker_heartbeat'
          AND dedupe_key = '_worker_heartbeat'
          AND status = 'COMPLETED'
          AND run_at >= now() - interval '30 seconds'
        LIMIT 1
      `);
      checks.worker_heartbeat = heartbeat.rowCount === 1;
    } else if (typeof worker?.isAlive === 'function') {
      checks.worker_heartbeat = worker.isAlive();
    } else {
      checks.worker_heartbeat = true;
    }
  } catch (err) {
    logger.warn({ err }, 'Readiness check: worker_heartbeat failed');
  }

  const allReady = Boolean(checks.database && checks.migrations && checks.worker_heartbeat);
  res.status(allReady ? 200 : 503).json({
    ok: allReady,
    service: 'jobenpay',
    status: allReady ? 'ready' : 'not_ready',
    checks: {
      ...checks,
      worker: checks.worker_heartbeat ? 'healthy' : (env.WORKER_ENABLED === 1 ? 'stale' : 'not-configured'),
    },
    timestamp: new Date().toISOString(),
  });
});

// Startup: cek migrasi selesai
healthRouter.get('/startupz', async (_req, res) => {
  try {
    const ready = await migrationStatus();
    res.status(ready ? 200 : 503).json({
      ok: ready,
      status: ready ? 'started' : 'starting',
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ ok: false, status: 'error' });
  }
});

export default healthRouter;
