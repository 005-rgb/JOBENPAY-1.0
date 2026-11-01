import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const configUrl = new URL('../../src/config.js', import.meta.url).href;

function importConfig(environment, unset = []) {
  const childEnvironment = { ...process.env, ...environment };
  for (const name of unset) delete childEnvironment[name];
  return spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(configUrl)})`], {
    encoding: 'utf8',
    env: childEnvironment,
  });
}

test('boot rejects a non-sandbox PayPal base or live mode', () => {
  const base = importConfig({ PAYPAL_API_BASE: 'https://provider.invalid' });
  assert.notEqual(base.status, 0);
  assert.match(base.stderr, /sandbox-only/);

  const mode = importConfig({ PAYPAL_MODE: 'live' });
  assert.notEqual(mode.status, 0);
  assert.match(mode.stderr, /must be sandbox/);
});

test('PayPal endpoint override is limited to local test servers', () => {
  const remote = importConfig({
    NODE_ENV: 'test',
    PAYPAL_API_BASE_OVERRIDE: 'https://provider.invalid',
  });
  assert.notEqual(remote.status, 0);
  assert.match(remote.stderr, /local tests/);

  const development = importConfig({
    NODE_ENV: 'development',
    PAYPAL_API_BASE_OVERRIDE: 'http://127.0.0.1:1234',
  });
  assert.notEqual(development.status, 0);
  assert.match(development.stderr, /local tests/);
});

test('production requires an explicit TLS PostgreSQL URL and an absolute upload directory', () => {
  const base = {
    NODE_ENV: 'production',
    PUBLIC_BASE_URL: 'https://nh.jobenapp.cloud',
    UPLOAD_DIR: 'C:\\private\\jobenpay\\uploads',
  };
  const noDatabase = importConfig(base, ['DATABASE_URL']);
  assert.notEqual(noDatabase.status, 0);
  assert.match(noDatabase.stderr, /DATABASE_URL must be explicitly configured/);

  const noTls = importConfig({
    ...base,
    DATABASE_URL: 'postgresql://user:password@db.example/jobenpay',
  });
  assert.notEqual(noTls.status, 0);
  assert.match(noTls.stderr, /must enable TLS/);

  const nonPostgres = importConfig({
    ...base,
    DATABASE_URL: 'https://db.example/jobenpay?sslmode=require',
  });
  assert.notEqual(nonPostgres.status, 0);
  assert.match(nonPostgres.stderr, /must use the PostgreSQL protocol/);

  const relativeUploads = importConfig({
    ...base,
    DATABASE_URL: 'postgresql://user:password@db.example/jobenpay?sslmode=require',
    UPLOAD_DIR: 'var/uploads',
  });
  assert.notEqual(relativeUploads.status, 0);
  assert.match(relativeUploads.stderr, /UPLOAD_DIR must be an absolute path/);

  const insideAppRoot = importConfig({
    ...base,
    DATABASE_URL: 'postgresql://user:password@db.example/jobenpay?sslmode=require',
    UPLOAD_DIR: path.join(process.cwd(), 'private-uploads'),
  });
  assert.notEqual(insideAppRoot.status, 0);
  assert.match(insideAppRoot.stderr, /UPLOAD_DIR must be outside the application root/);
});
