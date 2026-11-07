/**
 * server/test/unit/bulk-idempotency.test.js
 * Mutation idempotency tests for BULK (Item 7 CCC, PRD 1.3 §0.5, AD-17, T-19, K-BULK)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('BULK Mutation Idempotency Tests', async (t) => {
  function createIdempotencyEngine() {
    const store = new Map();

    return {
      async execute({ orgId, idempotencyKey, payload, handler }) {
        const cacheKey = `${orgId}:${idempotencyKey}`;
        const payloadHash = JSON.stringify(payload);

        if (store.has(cacheKey)) {
          const record = store.get(cacheKey);
          if (record.hash !== payloadHash) {
            const err = new Error('Idempotency key reused with different payload');
            err.code = 'IDEMPOTENCY_KEY_REUSED';
            err.statusCode = 422;
            throw err;
          }
          return { ...record.response, isCached: true };
        }

        const result = await handler(payload);
        store.set(cacheKey, { hash: payloadHash, response: result });
        return { ...result, isCached: false };
      },
    };
  }

  const orgId = 'org-bulk-idem-123';

  await t.test('1. First submission succeeds and caches batch response', async () => {
    const engine = createIdempotencyEngine();
    let handlerCalls = 0;

    const payload = {
      subType: 'payout',
      currency: 'USD',
      items: [
        { amountMinor: '5000', recipientEmail: 'a@example.com' },
        { amountMinor: '7000', recipientEmail: 'b@example.com' },
      ],
    };

    const res = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-bulk-001',
      payload,
      handler: async (p) => {
        handlerCalls++;
        return { batchId: 'batch-001', itemCount: p.items.length, status: 'SUBMITTED' };
      },
    });

    assert.equal(handlerCalls, 1);
    assert.equal(res.isCached, false);
    assert.equal(res.batchId, 'batch-001');
    assert.equal(res.itemCount, 2);
  });

  await t.test('2. Replaying identical request returns cached result without re-executing handler', async () => {
    const engine = createIdempotencyEngine();
    let handlerCalls = 0;

    const payload = {
      subType: 'payout',
      currency: 'USD',
      items: [{ amountMinor: '10000', recipientEmail: 'single@example.com' }],
    };

    const res1 = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-bulk-002',
      payload,
      handler: async () => {
        handlerCalls++;
        return { batchId: 'batch-002', status: 'SUBMITTED' };
      },
    });
    assert.equal(res1.isCached, false);
    assert.equal(handlerCalls, 1);

    const res2 = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-bulk-002',
      payload,
      handler: async () => {
        handlerCalls++;
        return { batchId: 'batch-002', status: 'SUBMITTED' };
      },
    });
    assert.equal(res2.isCached, true);
    assert.equal(handlerCalls, 1, 'Handler must not be executed on replay');
  });

  await t.test('3. Reusing key with modified item count is rejected with 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const engine = createIdempotencyEngine();

    const payload1 = {
      subType: 'payout',
      currency: 'USD',
      items: [{ amountMinor: '5000', recipientEmail: 'a@example.com' }],
    };

    await engine.execute({
      orgId,
      idempotencyKey: 'idemp-bulk-003',
      payload: payload1,
      handler: async () => ({ batchId: 'batch-003' }),
    });

    const payload2 = {
      subType: 'payout',
      currency: 'USD',
      items: [
        { amountMinor: '5000', recipientEmail: 'a@example.com' },
        { amountMinor: '6000', recipientEmail: 'b@example.com' }, // Modified items
      ],
    };

    await assert.rejects(
      async () => {
        await engine.execute({
          orgId,
          idempotencyKey: 'idemp-bulk-003',
          payload: payload2,
          handler: async () => ({ batchId: 'batch-003' }),
        });
      },
      (err) => err.code === 'IDEMPOTENCY_KEY_REUSED' && err.statusCode === 422
    );
  });
});

