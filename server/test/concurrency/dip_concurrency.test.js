// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDecisionIntegrityScore } from '../../src/services/dip_service.js';

test('PRD 1.6 §10.4 Decision Integrity Proof (DIP) Concurrency & Idempotency Tests', async (t) => {
  const intentAnchor = {
    intent_id: 'mnd_concurrent_01',
    org_id: 'org_concurrent_01',
    principal_user_id: 'usr_concurrent_01',
    natural_language_input: 'Purchase engineering laptops Apple/Dell max $2000 RAM 32GB',
    structured_intent: {
      purpose: 'equipment_purchase',
      constraints: {
        amount_range: { min: '0', max: '200000' },
        vendor_categories: ['electronics'],
        allowed_brands: ['Apple', 'Dell'],
        required_attributes: [
          { key: 'ram_gb', operator: 'gte', value: 32 },
        ],
        deadline: '2027-12-31T23:59:59Z',
      },
    },
    intent_hash: 'sha256:abc1230000000000000000000000000000000000000000000000000000000000',
    signature: 'base64:concurrent_sig',
    signing_key_id: 'key_concurrent',
    valid_from: '2026-01-01T00:00:00Z',
    valid_to: '2027-12-31T23:59:59Z',
    status: 'ACTIVE',
  };

  const transaction = {
    intent_id: 'tx_conc_01',
    category: 'SALE',
    amount_minor: '180000',
    currency: 'USD',
    metadata: {
      brand: 'Dell',
      counterparty_category: 'electronics',
      ram_gb: 32,
    },
  };

  const reasoningTrace = {
    request_id: 'tx_conc_01',
    reasons: [
      {
        claim: 'Hardware RAM 32GB spec met',
        evidence_ref: 'field:request.metadata.ram_gb',
        data_source: 'request_metadata',
        extracted_attributes: { ram_gb: 32, brand: 'Dell' },
      },
      {
        claim: 'Amount $1800 is within budget $2000',
        evidence_ref: 'field:request.amount_minor',
        data_source: 'request_metadata',
        extracted_attributes: { amount_minor: '180000' },
      },
      {
        claim: 'Electronics supplier verified in supplier catalog',
        evidence_ref: 'record:rec_dell_direct',
        data_source: 'vendor_profile',
        extracted_attributes: { vendor_category: 'electronics' },
      },
    ],
  };

  // 1. test_1000_parallel_dip
  await t.test('test_1000_parallel_dip: 1000 DIP computations parallel -> all complete in < 5 seconds', async () => {
    const startTime = Date.now();
    const tasks = Array.from({ length: 1000 }, (_, i) =>
      computeDecisionIntegrityScore({
        orgId: 'org_concurrent_01',
        transaction: { ...transaction, intent_id: `tx_conc_${i}` },
        intentAnchor,
        reasoningTrace: { ...reasoningTrace, request_id: `tx_conc_${i}` },
      })
    );

    const results = await Promise.all(tasks);
    const durationMs = Date.now() - startTime;

    assert.equal(results.length, 1000);
    for (const r of results) {
      assert.ok(r.score >= 80, `Expected score >= 80, got ${r.score}`);
      assert.equal(r.decision, 'AUTO_APPROVE');
      assert.equal(r.hard_rule_triggered, null);
    }

    assert.ok(
      durationMs < 5000,
      `1000 parallel DIP computations took ${durationMs}ms, which exceeded the 5000ms threshold`
    );
  });

  // 2. test_dip_idempotent
  await t.test('test_dip_idempotent: Repeated evaluation produces strictly identical score, hash, and components', async () => {
    const run1 = await computeDecisionIntegrityScore({
      orgId: 'org_concurrent_01',
      transaction,
      intentAnchor,
      reasoningTrace,
    });

    const run2 = await computeDecisionIntegrityScore({
      orgId: 'org_concurrent_01',
      transaction,
      intentAnchor,
      reasoningTrace,
    });

    const run3 = await computeDecisionIntegrityScore({
      orgId: 'org_concurrent_01',
      transaction,
      intentAnchor,
      reasoningTrace,
    });

    assert.equal(run1.score, run2.score);
    assert.equal(run2.score, run3.score);
    assert.equal(run1.decision, run2.decision);
    assert.equal(run1.hard_rule_triggered, run2.hard_rule_triggered);
    assert.equal(run1.trace_hash, run2.trace_hash);
    assert.deepEqual(run1.components, run2.components);
    assert.deepEqual(run2.components, run3.components);
  });
});
