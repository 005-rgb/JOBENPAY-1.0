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

test('production requires PostgreSQL, allows plaintext only over loopback, and requires absolute uploads', () => {
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

  const remoteNoTls = importConfig({
    ...base,
    DATABASE_URL: 'postgresql://db.example/jobenpay?sslmode=disable',
  });
  assert.notEqual(remoteNoTls.status, 0);
  assert.match(remoteNoTls.stderr, /must enable TLS/);

  const localNoTls = importConfig({
    ...base,
    DATABASE_URL: 'postgresql://localhost/jobenpay?sslmode=disable',
  });
  assert.equal(localNoTls.status, 0, localNoTls.stderr);

  const localTlsPreference = importConfig({
    ...base,
    DATABASE_URL: 'postgresql://127.0.0.1/jobenpay?sslmode=prefer',
  });
  assert.notEqual(localTlsPreference.status, 0);
  assert.match(localTlsPreference.stderr, /must omit sslmode or use sslmode=disable/);

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

test('production with REGISTRATION_ENABLED=1 requires HTTPS PUBLIC_BASE_URL and complete SMTP settings', () => {
  const prodBase = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://localhost/jobenpay?sslmode=disable',
    UPLOAD_DIR: 'C:\\private\\jobenpay\\uploads',
    PUBLIC_BASE_URL: 'http://insecure.test',
    REGISTRATION_ENABLED: '1',
  };

  const insecureUrl = importConfig(prodBase);
  assert.notEqual(insecureUrl.status, 0);
  assert.match(insecureUrl.stderr, /PUBLIC_BASE_URL must use HTTPS in production/);

  const missingSmtp = importConfig(
    {
      ...prodBase,
      PUBLIC_BASE_URL: 'https://secure.jobenapp.cloud',
    },
    ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'],
  );
  assert.notEqual(missingSmtp.status, 0);
  assert.match(missingSmtp.stderr, /When REGISTRATION_ENABLED=1 in production/);
  assert.match(missingSmtp.stderr, /SMTP_HOST/);

  const secretPass = 'SuperSecretSmtpPass!999';
  const validProd = importConfig({
    ...prodBase,
    PUBLIC_BASE_URL: 'https://secure.jobenapp.cloud',
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '587',
    SMTP_USER: 'smtpuser',
    SMTP_PASS: secretPass,
    SMTP_FROM: 'noreply@jobenapp.cloud',
  });
  assert.equal(validProd.status, 0, validProd.stderr);
  assert.ok(!validProd.stdout.includes(secretPass));
  assert.ok(!validProd.stderr.includes(secretPass));
});
