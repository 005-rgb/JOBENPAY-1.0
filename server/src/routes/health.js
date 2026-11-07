/**
 * server/src/routes/health.js
 * Endpoint pemeriksaan kesehatan proses (/healthz) dan kesiapan operasional (/readyz).
 * 
 * Aturan Pagar:
 * 1. /healthz memvalidasi proses Node.js hidup (liveness).
 * 2. /readyz memvalidasi koneksi PostgreSQL, seluruh migrasi disk terapkan (checksum valid),
 *    serta kesegaran heartbeat worker background.
 * 3. Gagal cepat (HTTP 503) bila DB terputus, migrasi tertinggal/rusak, atau worker heartbeat basi.
 */

import { Router } from 'express';
import pool from '../db/pool.js';
import { env } from '../config.js';
import { checkMigrationStatus } from '../db/migrate.js';
import { logger } from '../logger.js';

export const healthRouter = Router();

healthRouter.get('/healthz', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'jobenpay',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

healthRouter.get('/readyz', async (_req, res) => {
  try {
    const client = await pool.connect();
    let dbConnected = false;
    let migrationsOk = false;
    let workerStatus = 'not-configured';
    let ready = false;

    try {
      // 1. Verifikasi koneksi database
      const ping = await client.query('SELECT 1 as ping');
      dbConnected = ping.rowCount === 1;

      // 2. Verifikasi status migrasi dan checksum
      const migStatus = await checkMigrationStatus(client);
      migrationsOk = migStatus.upToDate;

      // 3. Verifikasi heartbeat worker
      if (env.WORKER_ENABLED === 1) {
        const heartbeat = await client.query(`
          SELECT 1
          FROM jobs
          WHERE type = '_worker_heartbeat'
            AND dedupe_key = '_worker_heartbeat'
            AND status = 'COMPLETED'
            AND run_at >= now() - interval '30 seconds'
          LIMIT 1
        `);
        if (heartbeat.rowCount === 1) {
          workerStatus = 'healthy';
        } else {
          workerStatus = 'stale';
        }
      } else {
        // Sebelum F1-6 atau jika worker tidak diaktifkan pada lingkungan ini
        workerStatus = 'not-configured';
      }

      ready = dbConnected && migrationsOk && (workerStatus === 'healthy' || workerStatus === 'not-configured');

      const responseStatus = ready ? 200 : 503;
      res.status(responseStatus).json({
        ok: ready,
        service: 'jobenpay',
        status: ready ? 'ready' : 'not_ready',
        checks: {
          database: dbConnected ? 'connected' : 'disconnected',
          migrations: migrationsOk ? 'up_to_date' : (migStatus.error || 'pending'),
          worker: workerStatus
        }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error({ err: error }, 'Readiness check failed with exception');
    res.status(503).json({
      ok: false,
      service: 'jobenpay',
      status: 'not_ready',
      checks: {
        database: 'error',
        migrations: 'unknown',
        worker: 'unknown'
      }
    });
  }
});

export default healthRouter;

