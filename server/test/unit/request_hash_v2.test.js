import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRequestHashV2, computeRequestHashV1 } from '../../../shared/request-hash.js';

const baseRequest = {
  org_id: '11111111-1111-4111-8111-111111111111',
  agent_id: '22222222-2222-4222-8222-222222222222',
  mandate_version_id: '33333333-3333-4333-8333-333333333333',
  intent_mandate_id: '44444444-4444-4444-8444-444444444444',
  action: 'PAY',
  category: 'TRANSFER',
  sub_type: 'WALLET_TRANSFER',
  amount_minor: 50000n,
  currency: 'USD',
  payee_id: 'payee_123',
  target_ref: 'ref_abc',
  document_sha256: 'sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
  reasoning_trace_hash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  intent_anchor_id: '55555555-5555-4555-8555-555555555555',
};

test('test_request_hash_v2_includes_intent', () => {
  const hash1 = computeRequestHashV2(baseRequest);
  const hash2 = computeRequestHashV2({
    ...baseRequest,
    intent_mandate_id: '99999999-9999-4999-8999-999999999999',
  });
  assert.ok(hash1.startsWith('sha256:'));
  assert.ok(hash2.startsWith('sha256:'));
  assert.notEqual(hash1, hash2, 'Hash must differ when intent_mandate_id changes');
});

test('test_request_hash_v2_includes_reasoning', () => {
  const hash1 = computeRequestHashV2(baseRequest);
  const hash2 = computeRequestHashV2({
    ...baseRequest,
    reasoning_trace_hash: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
  });
  assert.notEqual(hash1, hash2, 'Hash must differ when reasoning_trace_hash changes');
});

test('test_request_hash_v2_includes_anchor', () => {
  const hash1 = computeRequestHashV2(baseRequest);
  const hash2 = computeRequestHashV2({
    ...baseRequest,
    intent_anchor_id: '88888888-8888-4888-8888-888888888888',
  });
  assert.notEqual(hash1, hash2, 'Hash must differ when intent_anchor_id changes');
});

test('test_request_hash_v2_deterministic', () => {
  const baseline = computeRequestHashV2(baseRequest);
  for (let i = 0; i < 10000; i++) {
    const next = computeRequestHashV2(baseRequest);
    assert.equal(next, baseline, `Hash must be deterministic at iteration ${i}`);
  }
});

test('test_request_hash_v1_backward_compatible', () => {
  const v1Hash = computeRequestHashV1(baseRequest);
  assert.ok(v1Hash.startsWith('sha256:'));

  // Modifying v2-only fields must NOT change v1 hash
  const v1HashWithChangedV2Fields = computeRequestHashV1({
    ...baseRequest,
    intent_mandate_id: '99999999-9999-4999-8999-999999999999',
    reasoning_trace_hash: 'sha256:9999999999999999999999999999999999999999999999999999999999999999',
    intent_anchor_id: '99999999-9999-4999-8999-999999999999',
  });
  assert.equal(v1Hash, v1HashWithChangedV2Fields, 'v1 hash must remain unchanged when v2-only fields are altered');
});
