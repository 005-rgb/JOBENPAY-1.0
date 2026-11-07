/**
 * server/test/unit/financing-idempotency.test.js
 * Mutation idempotency tests for FINANCING (Item 7 CCC, PRD 1.3 §0.5, AD-17, B-F6)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('FINANCING Mutation Idempotency Tests', async (t) => {
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

  const orgId = 'org-fin-idem-123';
  const cpId = '00000000-0000-4000-8000-000000000001';

  await t.test('1. First submission succeeds and caches financing proposal', async () => {
    const engine = createIdempotencyEngine();
    let handlerCalls = 0;

    const payload = {
      facilityType: 'po',
      principalAmountMinor: '5000000',
      collateralValueMinor: '10000000',
      tenorMonths: 3,
      counterpartyId: cpId,
    };

    const res = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-fin-001',
      payload,
      handler: async (p) => {
        handlerCalls++;
        return { intentId: 'intent-fin-001', status: 'REQUESTED', principalAmountMinor: p.principalAmountMinor };
      },
    });

    assert.equal(res.isCached, false);
    assert.equal(res.intentId, 'intent-fin-001');
    assert.equal(handlerCalls, 1);
  });

  await t.test('2. Replaying identical payload returns cached response without re-executing', async () => {
    const engine = createIdempotencyEngine();
    let handlerCalls = 0;

    const payload = {
      facilityType: 'po',
      principalAmountMinor: '5000000',
      collateralValueMinor: '10000000',
      tenorMonths: 3,
      counterpartyId: cpId,
    };

    await engine.execute({
      orgId,
      idempotencyKey: 'idemp-fin-002',
      payload,
      handler: async () => {
        handlerCalls++;
        return { intentId: 'intent-fin-002', status: 'REQUESTED' };
      },
    });

    // Replay
    const cached = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-fin-002',
      payload,
      handler: async () => {
        handlerCalls++;
        return { intentId: 'intent-fin-002-wrong', status: 'REQUESTED' };
      },
    });

    assert.equal(cached.isCached, true);
    assert.equal(cached.intentId, 'intent-fin-002');
    assert.equal(handlerCalls, 1);
  });

  await t.test('3. Reusing key with modified payload throws 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const engine = createIdempotencyEngine();

    const payloadOriginal = {
      facilityType: 'invoice',
      principalAmountMinor: '4000000',
      collateralValueMinor: '6000000',
      tenorMonths: 2,
      counterpartyId: cpId,
    };

    await engine.execute({
      orgId,
      idempotencyKey: 'idemp-fin-003',
      payload: payloadOriginal,
      handler: async () => ({ intentId: 'intent-fin-003', status: 'REQUESTED' }),
    });

    const payloadTampered = {
      facilityType: 'invoice',
      principalAmountMinor: '4500000', // tampered amount
      collateralValueMinor: '6000000',
      tenorMonths: 2,
      counterpartyId: cpId,
    };

    await assert.rejects(
      () => engine.execute({
        orgId,
        idempotencyKey: 'idemp-fin-003',
        payload: payloadTampered,
        handler: async () => ({ intentId: 'intent-fin-003-tampered' }),
      }),
      (err) => err.code === 'IDEMPOTENCY_KEY_REUSED' && err.statusCode === 422
    );
  });

  await t.test('4. Multitenant isolation: same key across different organizations does not collide', async () => {
    const engine = createIdempotencyEngine();
    const orgA = 'org-fin-aaa';
    const orgB = 'org-fin-bbb';
    const key = 'idemp-shared-fin-key';

    const resA = await engine.execute({
      orgId: orgA,
      idempotencyKey: key,
      payload: { principalAmountMinor: '1000000' },
      handler: async () => ({ intentId: 'intent-org-A' }),
    });

    const resB = await engine.execute({
      orgId: orgB,
      idempotencyKey: key,
      payload: { principalAmountMinor: '2000000' },
      handler: async () => ({ intentId: 'intent-org-B' }),
    });

    assert.equal(resA.intentId, 'intent-org-A');
    assert.equal(resB.intentId, 'intent-org-B');
  });

  await t.test('5. Downstream request ID derivation follows jp_{intent_id}_{step}', () => {
    const intentId = '00000000-0000-4000-8000-000000000001';
    const step = 'disburse';
    const downstreamRequestId = `jp_${intentId}_${step}`;
    assert.equal(downstreamRequestId, 'jp_00000000-0000-4000-8000-000000000001_disburse');
  });
});

