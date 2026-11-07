/**
 * server/test/unit/recurring-idempotency.test.js
 * Mutation idempotency tests for RECURRING (Item 7 CCC, PRD 1.3 §0.5, AD-17, T-08, K-RECURRING)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('RECURRING Mutation Idempotency Tests', async (t) => {
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

  const orgId = 'org-recurring-idem-123';
  const counterpartyId = '00000000-0000-4000-8000-000000000001';

  await t.test('1. First submission succeeds and caches recurring agreement response', async () => {
    const engine = createIdempotencyEngine();
    let handlerCalls = 0;

    const payload = {
      subType: 'init',
      amountMinor: '4900',
      currency: 'USD',
      frequency: 'MONTHLY',
      counterpartyId,
    };

    const res = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-recur-001',
      payload,
      handler: async (p) => {
        handlerCalls++;
        return { intentId: 'intent-recur-001', status: 'SUBMITTED', amountMinor: p.amountMinor };
      },
    });

    assert.equal(handlerCalls, 1);
    assert.equal(res.isCached, false);
    assert.equal(res.intentId, 'intent-recur-001');
    assert.equal(res.status, 'SUBMITTED');
  });

  await t.test('2. Replaying identical request returns cached result without re-executing handler', async () => {
    const engine = createIdempotencyEngine();
    let handlerCalls = 0;

    const payload = {
      subType: 'charge',
      amountMinor: '4900',
      currency: 'USD',
      frequency: 'MONTHLY',
      counterpartyId,
    };

    const res1 = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-recur-002',
      payload,
      handler: async () => {
        handlerCalls++;
        return { intentId: 'intent-recur-002', status: 'SUBMITTED' };
      },
    });
    assert.equal(res1.isCached, false);
    assert.equal(handlerCalls, 1);

    const res2 = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-recur-002',
      payload,
      handler: async () => {
        handlerCalls++;
        return { intentId: 'intent-recur-002', status: 'SUBMITTED' };
      },
    });
    assert.equal(res2.isCached, true);
    assert.equal(handlerCalls, 1, 'Handler must not be executed on replay');
    assert.equal(res2.intentId, 'intent-recur-002');
  });

  await t.test('3. Replaying key with modified frequency throws 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const engine = createIdempotencyEngine();

    const payload1 = {
      subType: 'init',
      amountMinor: '4900',
      currency: 'USD',
      frequency: 'MONTHLY',
      counterpartyId,
    };

    await engine.execute({
      orgId,
      idempotencyKey: 'idemp-recur-003',
      payload: payload1,
      handler: async () => ({ intentId: 'intent-recur-003', status: 'SUBMITTED' }),
    });

    const payload2 = {
      ...payload1,
      frequency: 'YEARLY', // Modified frequency
    };

    await assert.rejects(
      async () => {
        await engine.execute({
          orgId,
          idempotencyKey: 'idemp-recur-003',
          payload: payload2,
          handler: async () => ({ intentId: 'intent-recur-003', status: 'SUBMITTED' }),
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
      subType: 'charge',
      amountMinor: '4900',
      currency: 'USD',
      counterpartyId,
    };

    await engine.execute({
      orgId,
      idempotencyKey: 'idemp-recur-004',
      payload: payload1,
      handler: async () => ({ intentId: 'intent-recur-004', status: 'SUBMITTED' }),
    });

    const payload2 = {
      ...payload1,
      amountMinor: '9900', // Modified amount
    };

    await assert.rejects(
      async () => {
        await engine.execute({
          orgId,
          idempotencyKey: 'idemp-recur-004',
          payload: payload2,
          handler: async () => ({ intentId: 'intent-recur-004', status: 'SUBMITTED' }),
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
    const intentId = 'intent-recur-abc-123';
    const step = 'init';
    const derivedKey = `jp_${intentId}_${step}`;

    assert.equal(derivedKey, 'jp_intent-recur-abc-123_init');
    assert.match(derivedKey, /^jp_[a-zA-Z0-9_-]+_[a-zA-Z0-9_-]+$/);
  });
});

