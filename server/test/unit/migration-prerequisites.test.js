import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationDir = new URL('../../migrations/', import.meta.url);
const triggerMigrationUrl = new URL('../../migrations/008_triggers.sql', import.meta.url);

test('migrations use built-in SQL expressions for UUID defaults without extensions or functions', async () => {
  const migrationFiles = (await readdir(migrationDir))
    .filter((name) => /^\d+_.*\.sql$/i.test(name))
    .sort();
  const migrations = await Promise.all(migrationFiles.map((name) => readFile(new URL(name, migrationDir), 'utf8')));
  const firstMigration = migrations[0];
  const allMigrations = migrations.join('\n');

  assert.ok(migrationFiles.length > 0, 'migration files must exist');
  assert.doesNotMatch(firstMigration, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i, 'UUID defaults must not require a custom UUID function');
  assert.doesNotMatch(allMigrations, /CREATE\s+EXTENSION|\bDO\s+\$\$/i, 'migrations must not require extensions or anonymous procedural blocks');
  assert.match(firstMigration, /DEFAULT\s+\(overlay\(overlay\(md5\(random\(\)::text[\s\S]*placing '4' from 13[\s\S]*placing CASE[\s\S]*from 17/i);
  assert.doesNotMatch(allMigrations, /DEFAULT\s+(?:public\.)?(?:gen_random_uuid|jobenpay_uuid_v4)\s*\(\s*\)/i, 'UUID defaults must not depend on unavailable functions');
  assert.doesNotMatch(allMigrations, /id\s+uuid\s+PRIMARY KEY\s+DEFAULT\s+(?!\(overlay\(overlay\(md5\()/i, 'all UUID id defaults must use the portable expression');
  assert.match(firstMigration, /md5\(random\(\)::text[\s\S]*clock_timestamp\(\)::text[\s\S]*txid_current\(\)::text[\s\S]*pg_backend_pid\(\)::text/i);
});

test('trigger migration uses PostgreSQL-compatible EXECUTE PROCEDURE syntax', async () => {
  const migration = await readFile(triggerMigrationUrl, 'utf8');

  assert.equal((migration.match(/EXECUTE\s+PROCEDURE\s+reject_/gi) || []).length, 2);
  assert.doesNotMatch(migration, /EXECUTE\s+FUNCTION/i);
});
