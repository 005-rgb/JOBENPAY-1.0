import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // Abaikan jika berkas .env tidak dapat dibaca
  }
}

if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = '1';
}

const { runMigrations } = await import('../src/db/migrate.js');

export { runMigrations };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations().then(() => {
    console.log('Migrations applied successfully with checksum tracking.');
  }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
