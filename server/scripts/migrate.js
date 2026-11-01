import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

import { env } from '../src/config.js';
import { databaseConnectionOptions } from '../src/db/connection.js';

const { Client } = pg;
const migrationDir = path.resolve(process.cwd(), 'server/migrations');
const lockKey = 20261030;

export async function runMigrations(connectionString = env.DATABASE_URL) {
  const client = new Client({
    ...databaseConnectionOptions(connectionString),
    statement_timeout: 10000,
  });
  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [lockKey]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await fs.readdir(migrationDir))
      .filter((name) => /^\d+_.*\.sql$/i.test(name))
      .sort();

    for (const file of files) {
      const exists = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
      if (exists.rowCount > 0) {
        continue;
      }

      const sql = await fs.readFile(path.join(migrationDir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(filename) VALUES($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [lockKey]).catch(() => undefined);
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations().then(() => {
    console.log('Migrations applied.');
  }).catch((error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
  });
}
