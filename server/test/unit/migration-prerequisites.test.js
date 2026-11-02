import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationDir = new URL('../../migrations/', import.meta.url);

test('first migration defines its own UUID generator without procedural SQL or extensions', async () => {
  const migrationFiles = (await readdir(migrationDir))
    .filter((name) => /^\d+_.*\.sql$/i.test(name))
    .sort();
  const migrations = await Promise.all(migrationFiles.map((name) => readFile(new URL(name, migrationDir), 'utf8')));
  const firstMigration = migrations[0];
  const functionIndex = firstMigration.search(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.jobenpay_uuid_v4\s*\(\s*\)/i);
  const uuidDefaultIndex = firstMigration.search(/DEFAULT\s+public\.jobenpay_uuid_v4\s*\(\s*\)/i);

  assert.ok(migrationFiles.length > 0, 'migration files must exist');
  assert.doesNotMatch(migrations.join('\n'), /CREATE\s+EXTENSION|\bDO\s+\$\$/i, 'migrations must not require extensions or anonymous procedural blocks');
  assert.notEqual(functionIndex, -1, 'migration must provide its UUID function');
  assert.notEqual(uuidDefaultIndex, -1, 'migration must define UUID defaults');
  assert.ok(functionIndex < uuidDefaultIndex, 'UUID function must be defined before UUID defaults');
  assert.doesNotMatch(migrations.join('\n'), /DEFAULT\s+gen_random_uuid\s*\(\s*\)/i, 'all UUID defaults must use the portable function');
  assert.match(firstMigration, /md5\(random\(\)::text[\s\S]*clock_timestamp\(\)::text[\s\S]*txid_current\(\)::text/i);
});
