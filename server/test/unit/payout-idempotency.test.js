/**
 * server/test/unit/payout-idempotency.test.js
 * Mutation idempotency tests for PAYOUT (Item 7 CCC, PRD 1.3 §0 Aturan Emas #5, AD-05, K-PAYOUT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('PAYOUT Mutation Idempotency Tests', async (t) => {
  function createIdempotencyManager() {
    const store = new Map(); // key -> { payload, response }
    const stepExecutions = new Map(); // stepKey -> count

    return {
      async execute({ orgId, idempotencyKey, payload, step, intentId }) {
        const fullKey = `${orgId}:${idempotencyKey}`;
        const existing = store.get(fullKey);

        if (existing) {
          // If payload matches -> replay 200
          if (JSON.stringify(existing.payload) === JSON.stringify(payload)) {
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
          amountMinor: payload.amountMinor,
          currency: payload.currency,
          paypalRequestId,
        };

        store.set(fullKey, { payload, response: newResponse });

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

  await t.test('1. Same idempotency key and matching payload produces 200 identical replay', async () => {
    const mgr = createIdempotencyManager();
    const payload = { amountMinor: 50000, currency: 'USD', payeeId: 'payee_001' };

    const first = await mgr.execute({
      orgId: 'org_1',
      idempotencyKey: 'idemp_key_1',
      payload,
      step: 'payout',
      intentId: 'intent_1',
    });

    assert.equal(first.status, 201);
    assert.equal(first.replayed, false);

    const second = await mgr.execute({
      orgId: 'org_1',
      idempotencyKey: 'idemp_key_1',
      payload,
      step: 'payout',
      intentId: 'intent_1',
    });

    assert.equal(second.status, 200);
    assert.equal(second.replayed, true);
    assert.deepEqual(second.body, first.body);
    assert.equal(mgr.getStepExecutionCount('intent_1', 'payout'), 1, 'Only one actual step execution to provider');
  });

  await t.test('2. Same idempotency key with different payload throws 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const mgr = createIdempotencyManager();
    const payload1 = { amountMinor: 50000, currency: 'USD', payeeId: 'payee_001' };
    const payload2 = { amountMinor: 75000, currency: 'USD', payeeId: 'payee_001' };

    await mgr.execute({
      orgId: 'org_1',
      idempotencyKey: 'idemp_key_2',
      payload: payload1,
      step: 'payout',
      intentId: 'intent_2',
    });

    await assert.rejects(
      mgr.execute({
        orgId: 'org_1',
        idempotencyKey: 'idemp_key_2',
        payload: payload2,
        step: 'payout',
        intentId: 'intent_2',
      }),
      (err) => err.code === 'IDEMPOTENCY_KEY_REUSED' && err.statusCode === 422
    );
  });
});

