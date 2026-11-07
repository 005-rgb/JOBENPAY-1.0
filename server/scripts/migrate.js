import { pathToFileURL } from 'node:url';
import { runMigrations } from '../src/db/migrate.js';

export { runMigrations };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations().then(() => {
    console.log('Migrations applied successfully with checksum tracking.');
  }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
