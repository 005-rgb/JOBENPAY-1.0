import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

const configUrl = new URL('../../src/config.js', import.meta.url).href;

function importConfig(environment) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(configUrl)})`], {
    encoding: 'utf8',
    env: { ...process.env, ...environment },
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
