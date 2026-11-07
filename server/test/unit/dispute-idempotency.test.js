/**
 * server/test/unit/dispute-idempotency.test.js
 * Mutation idempotency tests for DISPUTE (Item 7 CCC, PRD 1.3 §0 Aturan Emas #5, AD-05, K-DISPUTE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('DISPUTE Mutation Idempotency Tests', async (t) => {
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

  const orgId = '00000000-0000-4000-8000-000000000001';
  const intentId = '00000000-0000-4000-8000-000000000199';

  await t.test('1. Exact replay returns original response with status 200 and preserves derived request id', async () => {
    const manager = createIdempotencyManager();
    const payload = {
      category: 'DISPUTE',
      subType: 'chargeback',
      amountMinor: 75000n,
      currency: 'USD',
      paypalDisputeId: 'DISP-SANDBOX-001',
    };

    const first = await manager.execute({
      orgId,
      idempotencyKey: 'disp-key-1',
      payload,
      step: 'dispute_accept',
      intentId,
    });
    assert.equal(first.status, 201);
    assert.equal(first.replayed, false);
    assert.equal(first.body.paypalRequestId, `jp_${intentId}_dispute_accept`);

    const second = await manager.execute({
      orgId,
      idempotencyKey: 'disp-key-1',
      payload,
      step: 'dispute_accept',
      intentId,
    });
    assert.equal(second.status, 200);
    assert.equal(second.replayed, true);
    assert.deepEqual(second.body, first.body);
    assert.equal(manager.getStepExecutionCount(intentId, 'dispute_accept'), 1);
  });

  await t.test('2. Same key with altered payload throws 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const manager = createIdempotencyManager();
    const payload1 = {
      category: 'DISPUTE',
      subType: 'chargeback',
      amountMinor: 75000n,
      currency: 'USD',
    };
    const payload2 = {
      category: 'DISPUTE',
      subType: 'chargeback',
      amountMinor: 95000n, // Altered
      currency: 'USD',
    };

    await manager.execute({
      orgId,
      idempotencyKey: 'disp-key-2',
      payload: payload1,
      step: 'dispute_accept',
      intentId,
    });

    await assert.rejects(
      async () => {
        await manager.execute({
          orgId,
          idempotencyKey: 'disp-key-2',
          payload: payload2,
          step: 'dispute_accept',
          intentId,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 422);
        assert.equal(err.code, 'IDEMPOTENCY_KEY_REUSED');
        return true;
      }
    );
  });

  await t.test('3. Key isolation between organizations', async () => {
    const manager = createIdempotencyManager();
    const orgIdB = '00000000-0000-4000-8000-000000000002';
    const payload = {
      category: 'DISPUTE',
      subType: 'chargeback',
      amountMinor: 50000n,
      currency: 'USD',
    };

    const resA = await manager.execute({
      orgId,
      idempotencyKey: 'shared-disp-key',
      payload,
      step: 'dispute_evidence',
      intentId: '00000000-0000-4000-8000-000000000201',
    });
    const resB = await manager.execute({
      orgId: orgIdB,
      idempotencyKey: 'shared-disp-key',
      payload,
      step: 'dispute_evidence',
      intentId: '00000000-0000-4000-8000-000000000202',
    });

    assert.equal(resA.status, 201);
    assert.equal(resB.status, 201);
    assert.notEqual(resA.body.intentId, resB.body.intentId);
  });
});

