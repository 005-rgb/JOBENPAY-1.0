import { env } from './config.js';
import app from './app.js';

export function startServer(port = env.PORT) {
  const server = app.listen(port, () => {
    console.log(`JOBENPAY listening on http://localhost:${port}`);
  });

  return server;
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('server.js');
if (isDirectRun) {
  startServer();
}

export { app };
export default app;
