import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const firstMigrationUrl = new URL('../../migrations/001_identity_tenant.sql', import.meta.url);

test('first migration provides UUID generation without requiring pgcrypto', async () => {
  const migration = await readFile(firstMigrationUrl, 'utf8');
  const fallbackIndex = migration.search(/CREATE\s+FUNCTION\s+public\.gen_random_uuid\s*\(\s*\)/i);
  const uuidDefaultIndex = migration.search(/DEFAULT\s+gen_random_uuid\s*\(\s*\)/i);

  assert.doesNotMatch(migration, /CREATE\s+EXTENSION/i, 'migration must not require unavailable extensions');
  assert.notEqual(fallbackIndex, -1, 'migration must provide a fallback UUID function');
  assert.notEqual(uuidDefaultIndex, -1, 'migration must define UUID defaults');
  assert.ok(fallbackIndex < uuidDefaultIndex, 'UUID fallback must be defined before UUID defaults');
  assert.match(migration, /pg_function_is_visible\(oid\)/i, 'native UUID support must be preferred when available');
  assert.match(migration, /md5\(random\(\)::text[\s\S]*clock_timestamp\(\)::text[\s\S]*txid_current\(\)::text/i);
});
