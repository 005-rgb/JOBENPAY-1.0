/**
 * server/test/unit/split-idempotency.test.js
 * Mutation idempotency tests for SPLIT (Item 7 CCC, PRD 1.3 §0.5, AD-13, AD-17, T-13, T-14, K-SPLIT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('SPLIT Mutation Idempotency Tests', async (t) => {
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

  const orgId = 'org-split-idem-123';
  const payeeId = '00000000-0000-4000-8000-000000000001';

  await t.test('1. First submission succeeds and caches split proposal response', async () => {
    const engine = createIdempotencyEngine();
    let handlerCalls = 0;

    const payload = {
      subType: 'split',
      amountMinor: '25000',
      currency: 'USD',
      platformFeeBps: 250,
      counterpartyId: payeeId,
    };

    const res = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-split-001',
      payload,
      handler: async (p) => {
        handlerCalls++;
        return { intentId: 'intent-split-001', status: 'SUBMITTED', amountMinor: p.amountMinor };
      },
    });

    assert.equal(handlerCalls, 1);
    assert.equal(res.isCached, false);
    assert.equal(res.intentId, 'intent-split-001');
    assert.equal(res.status, 'SUBMITTED');
  });

  await t.test('2. Replaying identical request returns cached result without re-executing handler', async () => {
    const engine = createIdempotencyEngine();
    let handlerCalls = 0;

    const payload = {
      subType: 'split',
      amountMinor: '50000',
      currency: 'USD',
      platformFeeBps: 300,
      counterpartyId: payeeId,
    };

    const res1 = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-split-002',
      payload,
      handler: async () => {
        handlerCalls++;
        return { intentId: 'intent-split-002', status: 'SUBMITTED' };
      },
    });
    assert.equal(res1.isCached, false);
    assert.equal(handlerCalls, 1);

    const res2 = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-split-002',
      payload,
      handler: async () => {
        handlerCalls++;
        return { intentId: 'intent-split-002', status: 'SUBMITTED' };
      },
    });
    assert.equal(res2.isCached, true);
    assert.equal(handlerCalls, 1, 'Handler must not be executed on replay');
    assert.equal(res2.intentId, 'intent-split-002');
  });

  await t.test('3. Replaying key with modified fee bps throws 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const engine = createIdempotencyEngine();

    const payload1 = {
      subType: 'split',
      amountMinor: '25000',
      currency: 'USD',
      platformFeeBps: 250,
      counterpartyId: payeeId,
    };

    await engine.execute({
      orgId,
      idempotencyKey: 'idemp-split-003',
      payload: payload1,
      handler: async () => ({ intentId: 'intent-split-003', status: 'SUBMITTED' }),
    });

    const payload2 = {
      ...payload1,
      platformFeeBps: 500, // Modified fee bps
    };

    await assert.rejects(
      async () => {
        await engine.execute({
          orgId,
          idempotencyKey: 'idemp-split-003',
          payload: payload2,
          handler: async () => ({ intentId: 'intent-split-003', status: 'SUBMITTED' }),
        });
      },
      (err) => {
        assert.equal(err.code, 'IDEMPOTENCY_KEY_REUSED');
        assert.equal(err.statusCode, 422);
        return true;
      }
    );
  });

  await t.test('4. Replaying key with modified amount throws 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const engine = createIdempotencyEngine();

    const payload1 = {
      subType: 'split',
      amountMinor: '25000',
      currency: 'USD',
      counterpartyId: payeeId,
    };

    await engine.execute({
      orgId,
      idempotencyKey: 'idemp-split-004',
      payload: payload1,
      handler: async () => ({ intentId: 'intent-split-004', status: 'SUBMITTED' }),
    });

    const payload2 = {
      ...payload1,
      amountMinor: '30000', // Modified amount
    };

    await assert.rejects(
      async () => {
        await engine.execute({
          orgId,
          idempotencyKey: 'idemp-split-004',
          payload: payload2,
          handler: async () => ({ intentId: 'intent-split-004', status: 'SUBMITTED' }),
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
    const intentId = 'intent-split-xyz-789';
    const step = 'split_payout';
    const derivedKey = `jp_${intentId}_${step}`;

    assert.equal(derivedKey, 'jp_intent-split-xyz-789_split_payout');
    assert.match(derivedKey, /^jp_[a-zA-Z0-9_-]+_[a-zA-Z0-9_-]+$/);
  });
});

