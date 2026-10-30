import test from 'node:test';
import assert from 'node:assert/strict';

import { processWebhook } from '../../src/jobs/webhook.js';

test('process_webhook stub marks only verified event as RECEIVED', async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rowCount: 1 };
    },
  };
  await processWebhook({ payload: { orgId: 'ORG-1', eventId: 'EVENT-1' } }, { db });
  assert.equal(calls[0].params[0], 'ORG-1');
  assert.equal(calls[0].params[1], 'EVENT-1');
  assert.match(calls[0].sql, /verified = true/);
  assert.match(calls[0].sql, /status = 'RECEIVED'/);

  const missing = { query: async () => ({ rowCount: 0 }) };
  await assert.rejects(() => processWebhook({
    payload: { orgId: 'ORG-1', eventId: 'MISSING' },
  }, { db: missing }), /not found/);
});
