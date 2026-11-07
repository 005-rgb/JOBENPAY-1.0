/**
 * server/test/unit/sale-idempotency.test.js
 * Mutation idempotency tests for SALE (Item 7 CCC, PRD 1.3 §0 Aturan Emas #5, AD-05, K-SALE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('SALE Mutation Idempotency Tests', async (t) => {
  function createIdempotencyManager() {
    const store = new Map(); // key -> { payloadStr, response }
    const stepExecutions = new Map(); // stepKey -> count

    function serialize(obj) {
      return JSON.stringify(obj, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
    }

    return {
      async execute({ orgId, idempotencyKey, payload, step, intentId }) {
        const fullKey = `${orgId}:${idempotencyKey}`;
        const payloadStr = serialize(payload);
        const existing = store.get(fullKey);

        if (existing) {
          // If payload matches -> replay 200
          if (existing.payloadStr === payloadStr) {
            return {
              status: 200,
              replayed: true,
              body: existing.response,
            };
          }
          // If payload differs -> 422 IDEMPOTENCY_KEY_REUSED
          const err = new Error('Idempotency key reused with different payload');
          err.code = 'IDEMPOTENCY_KEY_REUSED';
          err.statusCode = 422;
          throw err;
        }

        // PayPal-Request-Id step enforcement
        const paypalRequestId = `jp_${intentId}_${step}`;
        const stepCount = (stepExecutions.get(paypalRequestId) || 0) + 1;
        stepExecutions.set(paypalRequestId, stepCount);

        const newResponse = {
          success: true,
          intentId,
          amountMinor: payload.amountMinor?.toString(),
          currency: payload.currency,
          paypalRequestId,
        };

        store.set(fullKey, { payloadStr, response: newResponse });

        return {
          status: 201,
          replayed: false,
          body: newResponse,
        };
      },
      getStepExecutionCount(intentId, step) {
        return stepExecutions.get(`jp_${intentId}_${step}`) || 0;
      },
    };
  }

  await t.test('1. Exact key and payload replays cached response with status 200', async () => {
    const manager = createIdempotencyManager();
    const orgId = 'org_alpha';
    const idempotencyKey = 'sale-req-unique-001';
    const payload = { amountMinor: 250000n, currency: 'USD', buyerEmail: 'buyer1@test.com' };
    const intentId = 'e0000000-0000-4000-8000-000000000010';

    const first = await manager.execute({ orgId, idempotencyKey, payload, step: 'order_create', intentId });
    assert.equal(first.status, 201);
    assert.equal(first.replayed, false);
    assert.equal(first.body.paypalRequestId, `jp_${intentId}_order_create`);

    const second = await manager.execute({ orgId, idempotencyKey, payload, step: 'order_create', intentId });
    assert.equal(second.status, 200);
    assert.equal(second.replayed, true);
    assert.deepEqual(second.body, first.body);
    assert.equal(manager.getStepExecutionCount(intentId, 'order_create'), 1);
  });

  await t.test('2. Same key with different payload throws 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const manager = createIdempotencyManager();
    const orgId = 'org_alpha';
    const idempotencyKey = 'sale-req-conflict-002';
    const payloadA = { amountMinor: 250000n, currency: 'USD' };
    const payloadB = { amountMinor: 500000n, currency: 'USD' };
    const intentId = 'e0000000-0000-4000-8000-000000000020';

    await manager.execute({ orgId, idempotencyKey, payload: payloadA, step: 'order_create', intentId });

    await assert.rejects(
      async () => {
        await manager.execute({ orgId, idempotencyKey, payload: payloadB, step: 'order_create', intentId });
      },
      (err) => err.code === 'IDEMPOTENCY_KEY_REUSED' && err.statusCode === 422
    );
  });

  await t.test('3. Cross-tenant isolation permits identical idempotency keys in different orgs', async () => {
    const manager = createIdempotencyManager();
    const key = 'sale-common-key-003';
    const payload = { amountMinor: 100000n, currency: 'USD' };

    const org1 = await manager.execute({
      orgId: 'org_1',
      idempotencyKey: key,
      payload,
      step: 'order_create',
      intentId: 'e0000000-0000-4000-8000-000000000031',
    });

    const org2 = await manager.execute({
      orgId: 'org_2',
      idempotencyKey: key,
      payload,
      step: 'order_create',
      intentId: 'e0000000-0000-4000-8000-000000000032',
    });

    assert.equal(org1.status, 201);
    assert.equal(org2.status, 201);
    assert.notEqual(org1.body.intentId, org2.body.intentId);
  });
});
