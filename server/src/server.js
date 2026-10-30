import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config.js';

const app = express();
const modulePath = fileURLToPath(import.meta.url);

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true, service: 'jobenpay', status: 'healthy' });
});

app.get('/readyz', (_req, res) => {
  res.status(200).json({ ok: true, service: 'jobenpay', status: 'ready' });
});

export function startServer(port = env.PORT) {
  const server = app.listen(port, () => {
    console.log(`JOBENPAY listening on http://localhost:${port}`);
  });

  return server;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === modulePath;
if (isDirectRun) {
  startServer();
}

export { app };
export default app;
