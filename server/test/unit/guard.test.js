import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

test('guard rejects a live PayPal host even when the sandbox host also exists', async () => {
  const fixture = path.join(root, `.guard-paypal-${randomUUID()}.js`);
  const liveHost = ['api-m', 'paypal', 'com'].join('.');
  await writeFile(fixture, `const forbidden = 'https://${liveHost}';\n`);
  try {
    assert.throws(
      () => execFileSync(process.execPath, ['scripts/guard.js'], {
        cwd: root,
        encoding: 'utf8',
        stdio: 'pipe',
      }),
      (error) => {
        assert.notEqual(error.status, 0);
        assert.match(`${error.stdout}${error.stderr}`, /Live PayPal host found/);
        return true;
      },
    );
  } finally {
    await rm(fixture, { force: true });
  }
});
