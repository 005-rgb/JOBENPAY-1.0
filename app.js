import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve('.env');
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
  process.exit(1);
});
