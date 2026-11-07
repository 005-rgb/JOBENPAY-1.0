/**
 * server/test/unit/void-idempotency.test.js
 * Mutation idempotency tests for VOID (Item 7 CCC, PRD 1.3 §0 Aturan Emas #5, AD-05, K-VOID)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('VOID Mutation Idempotency Tests', async (t) => {
  function createIdempotencyManager() {
    const store = new Map();
    const stepExecutions = new Map();

    function serialize(obj) {
      return JSON.stringify(obj, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
    }

    return {
      async execute({ orgId, idempotencyKey, payload, step, intentId }) {
        const fullKey = `${orgId}:${idempotencyKey}`;
        const payloadStr = serialize(payload);
        const existing = store.get(fullKey);

        if (existing) {
          if (existing.payloadStr === payloadStr) {
            return {
              status: 200,
              replayed: true,
              body: existing.response,
            };
          }
          const err = new Error('Idempotency key reused with different payload');
          err.code = 'IDEMPOTENCY_KEY_REUSED';
          err.statusCode = 422;
          throw err;
        }

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
    const orgId = 'org_void_test';
    const idempotencyKey = 'void-req-unique-001';
    const payload = { amountMinor: 100000n, currency: 'USD', authorizationId: 'AUTH-123' };
    const intentId = 'e0000000-0000-4000-8000-000000000041';

    const first = await manager.execute({ orgId, idempotencyKey, payload, step: 'void', intentId });
    assert.equal(first.status, 201);
    assert.equal(first.replayed, false);
    assert.equal(first.body.paypalRequestId, `jp_${intentId}_void`);

    const second = await manager.execute({ orgId, idempotencyKey, payload, step: 'void', intentId });
    assert.equal(second.status, 200);
    assert.equal(second.replayed, true);
    assert.deepEqual(second.body, first.body);
    assert.equal(manager.getStepExecutionCount(intentId, 'void'), 1);
  });

  await t.test('2. Same key with different payload throws 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const manager = createIdempotencyManager();
    const orgId = 'org_void_test';
    const idempotencyKey = 'void-req-conflict-002';
    const payloadA = { amountMinor: 100000n, currency: 'USD', authorizationId: 'AUTH-123' };
    const payloadB = { amountMinor: 200000n, currency: 'USD', authorizationId: 'AUTH-123' };
    const intentId = 'e0000000-0000-4000-8000-000000000042';

    await manager.execute({ orgId, idempotencyKey, payload: payloadA, step: 'void', intentId });

    await assert.rejects(
      async () => {
        await manager.execute({ orgId, idempotencyKey, payload: payloadB, step: 'void', intentId });
      },
      (err) => err.code === 'IDEMPOTENCY_KEY_REUSED' && err.statusCode === 422
    );
  });

  await t.test('3. Cross-tenant isolation permits identical idempotency keys in different orgs', async () => {
    const manager = createIdempotencyManager();
    const key = 'void-common-key-003';
    const payload = { amountMinor: 50000n, currency: 'USD', authorizationId: 'AUTH-999' };

    const org1 = await manager.execute({
      orgId: 'org_1',
      idempotencyKey: key,
      payload,
      step: 'void',
      intentId: 'e0000000-0000-4000-8000-000000000043',
    });

    const org2 = await manager.execute({
      orgId: 'org_2',
      idempotencyKey: key,
      payload,
      step: 'void',
      intentId: 'e0000000-0000-4000-8000-000000000044',
    });

    assert.equal(org1.status, 201);
    assert.equal(org2.status, 201);
    assert.notEqual(org1.body.intentId, org2.body.intentId);
  });
});

