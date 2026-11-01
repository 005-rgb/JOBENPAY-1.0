import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const root = process.cwd();
const finalLedgerTest = 'server/test/security/final-ledger.test.js';

function collectTests(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectTests(fullPath);
      return entry.isFile() && entry.name.endsWith('.test.js') ? [fullPath] : [];
    })
    .sort();
}

const testFiles = collectTests(path.join(root, 'server', 'test'))
  .map((file) => path.relative(root, file).replaceAll(path.sep, '/'))
  .filter((file) => file !== finalLedgerTest);

let adminClient;
let testSchema;
if (process.env.TEST_DATABASE_URL) {
  adminClient = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await adminClient.connect();
  testSchema = `jobenpay_test_${randomUUID().replaceAll('-', '')}`;
  await adminClient.query(`CREATE SCHEMA ${testSchema}`);
  const scopedUrl = new URL(process.env.TEST_DATABASE_URL);
  scopedUrl.searchParams.set('options', `-c search_path=${testSchema},public`);
  process.env.TEST_DATABASE_URL = scopedUrl.toString();
  process.env.DATABASE_URL = scopedUrl.toString();
  const { runMigrations } = await import('../server/scripts/migrate.js');
  await runMigrations(scopedUrl.toString());
}

try {
  for (const args of [
    ['--import=./server/test/setup.js', '--test', '--test-concurrency=1', ...testFiles],
    ['--import=./server/test/setup.js', '--test', finalLedgerTest],
  ]) {
    const result = spawnSync(process.execPath, args, { cwd: root, env: process.env, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      break;
    }
  }
} finally {
  if (adminClient) {
    try {
      await adminClient.query(`DROP SCHEMA ${testSchema} CASCADE`);
    } finally {
      await adminClient.end();
    }
  }
}
