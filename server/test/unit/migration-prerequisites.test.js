import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const firstMigrationUrl = new URL('../../migrations/001_identity_tenant.sql', import.meta.url);

test('first migration enables pgcrypto before using gen_random_uuid defaults', async () => {
  const migration = await readFile(firstMigrationUrl, 'utf8');
  const extensionIndex = migration.search(/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+pgcrypto\s*;/i);
  const uuidDefaultIndex = migration.search(/DEFAULT\s+gen_random_uuid\s*\(\s*\)/i);

  assert.notEqual(extensionIndex, -1, 'pgcrypto extension is required');
  assert.notEqual(uuidDefaultIndex, -1, 'migration must define UUID defaults');
  assert.ok(extensionIndex < uuidDefaultIndex, 'pgcrypto must be enabled before UUID defaults');
});
