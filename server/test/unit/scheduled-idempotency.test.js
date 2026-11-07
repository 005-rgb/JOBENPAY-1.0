/**
 * server/test/unit/scheduled-idempotency.test.js
 * Mutation idempotency tests for SCHEDULED (Item 7 CCC, PRD 1.3 §0.5, AD-14, K-SCHEDULED)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('SCHEDULED Mutation Idempotency Tests', async (t) => {
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

  const orgId = 'org-sched-idem-123';

  await t.test('1. First submission succeeds and caches response', async () => {
    const engine = createIdempotencyEngine();
    let handlerCalls = 0;

    const payload = {
      subType: 'payout',
      amountMinor: '10000',
      currency: 'USD',
      scheduledAt: '2026-12-01T10:00:00Z',
    };

    const res = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-sched-001',
      payload,
      handler: async (p) => {
        handlerCalls++;
        return { intentId: 'intent-sched-001', status: 'SUBMITTED', scheduledAt: p.scheduledAt };
      },
    });

    assert.equal(handlerCalls, 1);
    assert.equal(res.isCached, false);
    assert.equal(res.intentId, 'intent-sched-001');
    assert.equal(res.status, 'SUBMITTED');
  });

  await t.test('2. Replaying identical request returns cached result without re-executing handler', async () => {
    const engine = createIdempotencyEngine();
    let handlerCalls = 0;

    const payload = {
      subType: 'charge',
      amountMinor: '5000',
      currency: 'USD',
      scheduledAt: '2026-12-05T15:00:00Z',
    };

    const res1 = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-sched-002',
      payload,
      handler: async (p) => {
        handlerCalls++;
        return { intentId: 'intent-sched-002', status: 'SUBMITTED', scheduledAt: p.scheduledAt };
      },
    });
    assert.equal(res1.isCached, false);
    assert.equal(handlerCalls, 1);

    const res2 = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-sched-002',
      payload,
      handler: async () => {
        handlerCalls++;
        return { intentId: 'intent-sched-002', status: 'SUBMITTED' };
      },
    });
    assert.equal(res2.isCached, true);
    assert.equal(handlerCalls, 1, 'Handler must not be executed on replay');
    assert.equal(res2.intentId, 'intent-sched-002');
  });

  await t.test('3. Reusing key with different payload is rejected with 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const engine = createIdempotencyEngine();

    const payload1 = {
      subType: 'payout',
      amountMinor: '20000',
      currency: 'USD',
      scheduledAt: '2026-12-10T10:00:00Z',
    };

    await engine.execute({
      orgId,
      idempotencyKey: 'idemp-sched-003',
      payload: payload1,
      handler: async () => ({ intentId: 'intent-sched-003' }),
    });

    const payload2 = {
      subType: 'payout',
      amountMinor: '25000', // Modified amount
      currency: 'USD',
      scheduledAt: '2026-12-10T10:00:00Z',
    };

    await assert.rejects(
      async () => {
        await engine.execute({
          orgId,
          idempotencyKey: 'idemp-sched-003',
          payload: payload2,
          handler: async () => ({ intentId: 'intent-sched-003' }),
        });
      },
      (err) => err.code === 'IDEMPOTENCY_KEY_REUSED' && err.statusCode === 422
    );
  });
});

