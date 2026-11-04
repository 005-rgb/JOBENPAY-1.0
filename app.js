if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = '2';
}

import fs from 'node:fs';
import path from 'node:path';

const appDir = import.meta.dirname || path.resolve('.');
const envPath = path.resolve(appDir, '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envPath);
  } catch (err) {
    console.warn('Could not load .env file:', err.message);
  }
}

(async () => {
  const { assertRuntimeSecrets } = await import('./server/src/config.js');
  assertRuntimeSecrets();
  const { startServer } = await import('./server/src/server.js');
  startServer();
})().catch((error) => {
  console.error('Failed to start JOBENPAY server:', error);
  try {
    const tmpDir = path.resolve(appDir, 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    fs.writeFileSync(
      path.resolve(tmpDir, 'startup-error.log'),
      `[${new Date().toISOString()}] ${error.stack || error.message || String(error)}\n`,
      'utf8'
    );
  } catch {}
  process.exit(1);
});
