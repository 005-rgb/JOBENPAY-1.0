import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';
import { pool } from '../../src/db/pool.js';
import { AGGREGATE_STATES } from '../../../shared/state-machine.js';

test('unified fase 1 ops state-machines api integration', async (t) => {
  let appInfo;

  t.before(async () => {
    appInfo = await startTestApp();
  });

  t.after(async () => {
    if (appInfo?.server) {
      await closeTestApp(appInfo.server);
    }
    await pool.end();
  });

  await t.test('GET /api/v1/ops/state-machines returns aggregate states and transitions', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/ops/state-machines`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(Array.isArray(data.states));
    assert.ok(Array.isArray(data.transitions));
    assert.deepEqual(data.states, AGGREGATE_STATES);

    const draftToSubmitted = data.transitions.find(
      (tr) => tr.from === 'DRAFT' && tr.to === 'SUBMITTED' && tr.actor === 'agent',
    );
    assert.ok(draftToSubmitted);

    const submittedToEvaluating = data.transitions.find(
      (tr) => tr.from === 'SUBMITTED' && tr.to === 'EVALUATING' && tr.actor === 'worker',
    );
    assert.ok(submittedToEvaluating);
  });
});
