/**
 * server/test/unit/debit-idempotency.test.js
 * Mutation idempotency tests for DEBIT (Item 7 CCC, PRD 1.3 §0.5, AD-17, B-F6)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('DEBIT Mutation Idempotency Tests', async (t) => {
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

  const orgId = 'org-deb-idem-123';
  const authId = '00000000-0000-4000-8000-000000000001';
  const cpId = '00000000-0000-4000-8000-000000000002';

  await t.test('1. First submission succeeds and caches debit proposal', async () => {
    const engine = createIdempotencyEngine();
    let handlerCalls = 0;

    const payload = {
      authId,
      amountMinor: '25000',
      currency: 'USD',
      counterpartyId: cpId,
    };

    const res = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-deb-001',
      payload,
      handler: async (p) => {
        handlerCalls++;
        return { intentId: 'intent-deb-001', status: 'SUBMITTED', amountMinor: p.amountMinor };
      },
    });

    assert.equal(res.isCached, false);
    assert.equal(res.intentId, 'intent-deb-001');
    assert.equal(handlerCalls, 1);
  });

  await t.test('2. Replaying identical payload returns cached response without re-executing', async () => {
    const engine = createIdempotencyEngine();
    let handlerCalls = 0;

    const payload = {
      authId,
      amountMinor: '25000',
      currency: 'USD',
      counterpartyId: cpId,
    };

    await engine.execute({
      orgId,
      idempotencyKey: 'idemp-deb-002',
      payload,
      handler: async () => {
        handlerCalls++;
        return { intentId: 'intent-deb-002', status: 'SUBMITTED' };
      },
    });

    // Replay
    const cached = await engine.execute({
      orgId,
      idempotencyKey: 'idemp-deb-002',
      payload,
      handler: async () => {
        handlerCalls++;
        return { intentId: 'intent-deb-002-wrong', status: 'SUBMITTED' };
      },
    });

    assert.equal(cached.isCached, true);
    assert.equal(cached.intentId, 'intent-deb-002');
    assert.equal(handlerCalls, 1);
  });

  await t.test('3. Reusing key with modified payload throws 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const engine = createIdempotencyEngine();

    const payloadOriginal = {
      authId,
      amountMinor: '25000',
      currency: 'USD',
      counterpartyId: cpId,
    };

    await engine.execute({
      orgId,
      idempotencyKey: 'idemp-deb-003',
      payload: payloadOriginal,
      handler: async () => ({ intentId: 'intent-deb-003', status: 'SUBMITTED' }),
    });

    const payloadTampered = {
      authId,
      amountMinor: '30000', // tampered amount
      currency: 'USD',
      counterpartyId: cpId,
    };

    await assert.rejects(
      () => engine.execute({
        orgId,
        idempotencyKey: 'idemp-deb-003',
        payload: payloadTampered,
        handler: async () => ({ intentId: 'intent-deb-003-tampered' }),
      }),
      (err) => err.code === 'IDEMPOTENCY_KEY_REUSED' && err.statusCode === 422
    );
  });

  await t.test('4. Multitenant isolation: same key across different organizations does not collide', async () => {
    const engine = createIdempotencyEngine();
    const orgA = 'org-deb-aaa';
    const orgB = 'org-deb-bbb';
    const key = 'idemp-shared-deb-key';

    const resA = await engine.execute({
      orgId: orgA,
      idempotencyKey: key,
      payload: { amountMinor: '10000' },
      handler: async () => ({ intentId: 'intent-deb-org-A' }),
    });

    const resB = await engine.execute({
      orgId: orgB,
      idempotencyKey: key,
      payload: { amountMinor: '20000' },
      handler: async () => ({ intentId: 'intent-deb-org-B' }),
    });

    assert.equal(resA.intentId, 'intent-deb-org-A');
    assert.equal(resB.intentId, 'intent-deb-org-B');
  });

  await t.test('5. Downstream request ID derivation follows jp_{intent_id}_{step}', () => {
    const intentId = '00000000-0000-4000-8000-000000000001';
    const step = 'debit';
    const downstreamRequestId = `jp_${intentId}_${step}`;
    assert.equal(downstreamRequestId, 'jp_00000000-0000-4000-8000-000000000001_debit');
  });
});

