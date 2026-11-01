import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const loggerUrl = new URL('../../src/lib/logger.js', import.meta.url).href;
const secretValues = [
  'auth-secret-value',
  'cookie-secret-value',
  'client-secret-value',
  'api-key-secret-value',
  'password-secret-value',
  'encrypted-secret-value',
  'bearer-token-value',
  'access-token-value',
  'refresh-token-value',
  'nested-password-value',
  'error-message-secret-value',
];

test('logger redacts required secret fields', () => {
  const code = [
    `import { logger } from ${JSON.stringify(loggerUrl)};`,
    `logger.info({ authorization: ${JSON.stringify(secretValues[0])}, cookie: ${JSON.stringify(secretValues[1])}, client_secret: ${JSON.stringify(secretValues[2])}, api_key: ${JSON.stringify(secretValues[3])}, password: ${JSON.stringify(secretValues[4])}, private_enc: ${JSON.stringify(secretValues[5])}, token: ${JSON.stringify(secretValues[6])}, access_token: ${JSON.stringify(secretValues[7])}, refresh_token: ${JSON.stringify(secretValues[8])}, payload: { nestedPassword: ${JSON.stringify(secretValues[9])} }, err: Object.assign(new Error(${JSON.stringify(secretValues[10])}), { code: 'SAFE_CODE' }) }, 'redaction-test');`,
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  for (const secret of secretValues) {
    assert.equal(result.stdout.includes(secret), false, `log leaked ${secret}`);
  }
});
