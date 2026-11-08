// @ts-check
import { logger } from './lib/logger.js';
import { pool } from './db/pool.js';
import { worker } from './jobs/worker.js';

const SHUTDOWN_TIMEOUT_MS = 30000;

export function setupGracefulShutdown(server, options = {}) {
  let isShuttingDown = false;
  const timeoutMs = options.timeoutMs ?? SHUTDOWN_TIMEOUT_MS;
  const targetPool = options.pool ?? pool;
  const targetWorker = options.worker ?? worker;
  const exitFn = options.exit ?? process.exit;

  async function shutdown(signal = 'SIGTERM') {
    if (isShuttingDown) {
      logger.warn({ signal }, 'Shutdown already in progress');
      return;
    }
    isShuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown initiated');

    // 1. Stop accepting new connections
    if (server && typeof server.close === 'function') {
      server.close(() => {
        logger.info('HTTP server closed');
      });
    }

    // 2. Stop worker from claiming new jobs
    if (targetWorker && typeof targetWorker.pause === 'function') {
      targetWorker.pause();
    }

    // 3. Wait for in-flight requests (with timeout)
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      logger.error('Shutdown timeout exceeded, forcing exit');
      exitFn(1);
    }, timeoutMs);
    if (typeof timeout.unref === 'function') {
      timeout.unref();
    }

    try {
      // 4. Wait for worker to finish current jobs
      if (targetWorker && typeof targetWorker.drain === 'function') {
        await targetWorker.drain();
        logger.info('Worker drained');
      }

      // 5. Close database pool
      if (targetPool && typeof targetPool.end === 'function') {
        await targetPool.end();
        logger.info('Database pool closed');
      }

      clearTimeout(timeout);
      if (!timedOut) {
        logger.info('Graceful shutdown complete');
        exitFn(0);
      }
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      clearTimeout(timeout);
      if (!timedOut) {
        exitFn(1);
      }
    }
  }

  if (options.registerSignals !== false) {
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  return { shutdown, isShuttingDown: () => isShuttingDown };
}
