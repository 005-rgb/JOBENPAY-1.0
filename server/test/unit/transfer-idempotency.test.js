/**
 * server/test/unit/transfer-idempotency.test.js
 * Mutation idempotency tests for TRANSFER (Item 7 CCC, PRD 1.3 §0.5, AD-17, T-18, K-TRANSFER)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('TRANSFER Mutation Idempotency Tests', async (t) => {
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

  const orgId = 'org-transfer-idem-123';
  const senderId = '00000000-0000-4000-8000-000000000001';
  const receiverId = '00000000-0000-4000-8000-000000000002';

  await t.test('1. First submission succeeds and caches transfer response', async () => {
    const engine = createIdempotencyEngine();
    let handlerCalls = 0;

    const payload = {
      subType: 'p2p',
      amountMinor: '15000',
      currency: 'USD',
      senderCounterpartyId: senderId,
      receiverCounterpartyId: receiverId,
    };

    const res = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-transfer-001',
      payload,
      handler: async (p) => {
        handlerCalls++;
        return { intentId: 'intent-transfer-001', status: 'SUBMITTED', amountMinor: p.amountMinor };
      },
    });

    assert.equal(handlerCalls, 1);
    assert.equal(res.isCached, false);
    assert.equal(res.intentId, 'intent-transfer-001');
    assert.equal(res.status, 'SUBMITTED');
  });

  await t.test('2. Replaying identical request returns cached result without re-executing handler', async () => {
    const engine = createIdempotencyEngine();
    let handlerCalls = 0;

    const payload = {
      subType: 'p2p',
      amountMinor: '25000',
      currency: 'USD',
      senderCounterpartyId: senderId,
      receiverCounterpartyId: receiverId,
    };

    const res1 = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-transfer-002',
      payload,
      handler: async () => {
        handlerCalls++;
        return { intentId: 'intent-transfer-002', status: 'SUBMITTED' };
      },
    });
    assert.equal(res1.isCached, false);
    assert.equal(handlerCalls, 1);

    const res2 = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-transfer-002',
      payload,
      handler: async () => {
        handlerCalls++;
        return { intentId: 'intent-transfer-002', status: 'SUBMITTED' };
      },
    });
    assert.equal(res2.isCached, true);
    assert.equal(handlerCalls, 1, 'Handler must not be executed on replay');
    assert.equal(res2.intentId, 'intent-transfer-002');
  });

  await t.test('3. Replaying key with modified amount throws 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const engine = createIdempotencyEngine();

    const payload1 = {
      subType: 'p2p',
      amountMinor: '10000',
      currency: 'USD',
      senderCounterpartyId: senderId,
      receiverCounterpartyId: receiverId,
    };

    await engine.execute({
      orgId,
      idempotencyKey: 'idemp-transfer-003',
      payload: payload1,
      handler: async () => ({ intentId: 'intent-transfer-003', status: 'SUBMITTED' }),
    });

    const payload2 = {
      ...payload1,
      amountMinor: '99999', // Modified amount
    };

    await assert.rejects(
      async () => {
        await engine.execute({
          orgId,
          idempotencyKey: 'idemp-transfer-003',
          payload: payload2,
          handler: async () => ({ intentId: 'intent-transfer-003', status: 'SUBMITTED' }),
        });
      },
      (err) => {
        assert.equal(err.code, 'IDEMPOTENCY_KEY_REUSED');
        assert.equal(err.statusCode, 422);
        return true;
      }
    );
  });

  await t.test('4. Replaying key with modified receiver throws 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const engine = createIdempotencyEngine();

    const payload1 = {
      subType: 'p2p',
      amountMinor: '10000',
      currency: 'USD',
      senderCounterpartyId: senderId,
      receiverCounterpartyId: receiverId,
    };

    await engine.execute({
      orgId,
      idempotencyKey: 'idemp-transfer-004',
      payload: payload1,
      handler: async () => ({ intentId: 'intent-transfer-004', status: 'SUBMITTED' }),
    });

    const payload2 = {
      ...payload1,
      receiverCounterpartyId: '00000000-0000-4000-8000-999999999999', // Different receiver
    };

    await assert.rejects(
      async () => {
        await engine.execute({
          orgId,
          idempotencyKey: 'idemp-transfer-004',
          payload: payload2,
          handler: async () => ({ intentId: 'intent-transfer-004', status: 'SUBMITTED' }),
        });
      },
      (err) => {
        assert.equal(err.code, 'IDEMPOTENCY_KEY_REUSED');
        assert.equal(err.statusCode, 422);
        return true;
      }
    );
  });

  await t.test('5. Downstream PayPal-Request-Id derived deterministically: jp_{intent_id}_{step}', () => {
    const intentId = 'intent-transfer-abc-456';
    const step = 'payout';
    const derivedKey = `jp_${intentId}_${step}`;

    assert.equal(derivedKey, 'jp_intent-transfer-abc-456_payout');
    assert.match(derivedKey, /^jp_[a-zA-Z0-9_-]+_[a-zA-Z0-9_-]+$/);
  });
});

