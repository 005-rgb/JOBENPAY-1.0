// @ts-check
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { worker } from '../jobs/worker.js';
import { migrationStatus } from '../db/migrations.js';
import { logger } from '../lib/logger.js';

export const healthRouter = Router();

// Liveness: hanya cek process alive
healthRouter.get('/healthz', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'jobenpay',
    status: 'ok',
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
    checks.worker_heartbeat = typeof worker?.isAlive === 'function' ? worker.isAlive() : true;
  } catch (err) {
    logger.warn({ err }, 'Readiness check: worker_heartbeat failed');
  }

  const allReady = Boolean(checks.database && checks.migrations && checks.worker_heartbeat);
  res.status(allReady ? 200 : 503).json({
    ok: allReady,
    service: 'jobenpay',
    status: allReady ? 'ready' : 'not_ready',
    checks,
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
