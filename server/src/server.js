import { env } from './config.js';
import app from './app.js';
import { startWorker } from './jobs/worker.js';
import { logger } from './lib/logger.js';

export function startServer(port = env.PORT) {
  const server = app.listen(port, () => {
    console.log(`JOBENPAY listening on http://localhost:${port}`);
  });

  if (env.WORKER_ENABLED === 1) {
    const worker = startWorker();
    process.once('SIGTERM', () => {
      server.close();
      worker.stop().catch((error) => {
        logger.error({ err: error }, 'Worker shutdown failed');
        process.exitCode = 1;
      });
    });
  }

  return server;
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('server.js');
if (isDirectRun) {
  startServer();
}

export { app };
export default app;
