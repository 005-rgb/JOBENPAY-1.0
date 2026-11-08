// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';
import { pool } from '../../src/db/pool.js';

test('health endpoints integration', async (t) => {
  let appInfo;

  t.before(async () => {
    appInfo = await startTestApp();
  });

  t.after(async () => {
    if (appInfo?.server) {
      await closeTestApp(appInfo.server);
    }
  });

  await t.test('test_healthz_200', async () => {
    const res = await fetch(`${appInfo.url}/healthz`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.status === 'healthy' || data.status === 'ok');
    assert.ok(data.timestamp);
  });

  await t.test('test_readyz_200', async () => {
    const res = await fetch(`${appInfo.url}/readyz`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ready');
    assert.equal(data.checks.database, true);
    assert.equal(data.checks.migrations, true);
  });

  await t.test('test_readyz_503_db_down', async () => {
    const originalQuery = pool.query;
    try {
      pool.query = async (text, params) => {
        if (typeof text === 'string' && text.includes('SELECT 1')) {
          throw new Error('ECONNREFUSED: Database offline');
        }
        return originalQuery.call(pool, text, params);
      };

      const res = await fetch(`${appInfo.url}/readyz`);
      assert.equal(res.status, 503);
      const data = await res.json();
      assert.equal(data.status, 'not_ready');
      assert.equal(data.checks.database, false);
    } finally {
      pool.query = originalQuery;
    }
  });

  await t.test('test_startupz_200', async () => {
    const res = await fetch(`${appInfo.url}/startupz`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'started');
    assert.equal(data.ok, true);
  });
});
