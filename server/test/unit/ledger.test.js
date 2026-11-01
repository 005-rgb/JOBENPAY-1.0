import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEDGER_TYPES,
  appendEntry,
  assertSafePayload,
  verifyChain,
  exportLedger,
} from '../../src/services/ledger.js';

test('ledger constants and payload guard are defined', () => {
  assert.ok(LEDGER_TYPES && typeof LEDGER_TYPES === 'object');
  assert.ok(LEDGER_TYPES.REQUEST_RECEIVED);
  assert.doesNotThrow(() => assertSafePayload(null));
  assert.doesNotThrow(() => assertSafePayload(undefined));
  assert.doesNotThrow(() => assertSafePayload({ nested: [true, 1, 'safe', null] }));
  assert.throws(() => assertSafePayload({ client_secret: 'x' }), /client_secret/i);
  assert.throws(() => assertSafePayload({ nested: { token: 'abc' } }), /token/i);
  assert.throws(() => assertSafePayload(1n), /BigInt/);
  assert.throws(() => assertSafePayload({ nested: [1n] }), /BigInt/);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.doesNotThrow(() => assertSafePayload(cyclic));
});

test('appendEntry requires a transaction client', async () => {
  await assert.rejects(async () => appendEntry(undefined, {
    orgId: '11111111-1111-4111-8111-111111111111',
    type: LEDGER_TYPES.REQUEST_RECEIVED,
    subjectType: 'REQUEST',
    subjectId: '22222222-2222-4222-8222-222222222222',
    payload: { ok: true },
  }), /transaction/i);
  await assert.rejects(async () => appendEntry({ query() {} }, {
    type: LEDGER_TYPES.REQUEST_RECEIVED,
  }), /orgId/i);
  await assert.rejects(async () => appendEntry({ query() {} }, {
    orgId: '11111111-1111-4111-8111-111111111111',
    type: 'UNSUPPORTED',
  }), /Unsupported ledger type/);
});

test('verifyChain rejects a missing orgId', async () => {
  await assert.rejects(verifyChain(undefined), /orgId/i);
});

test('exportLedger requires an orgId', async () => {
  const iterator = exportLedger(undefined, { format: 'json' });
  await assert.rejects(async () => {
    for await (const entry of iterator) {
      void entry;
    }
  }, /orgId/i);
  await assert.rejects(async () => {
    for await (const entry of exportLedger('11111111-1111-4111-8111-111111111111', { format: 'csv' })) {
      void entry;
    }
  }, /Only JSON/);
});
