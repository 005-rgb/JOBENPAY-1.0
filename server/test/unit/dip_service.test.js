// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePurpose,
  evaluateAmount,
  evaluateVendor,
  evaluateBrand,
  evaluateAttributes,
  evaluateEvidence,
  computeDecisionIntegrityScore,
  DIP_WEIGHTS,
} from '../../src/services/dip_service.js';

test('PRD 1.6 §10.1 Decision Integrity Proof (DIP) Unit Tests', async (t) => {
  // 1. test_dis_purpose_match
  await t.test('test_dis_purpose_match: C_purpose = 1 untuk kategori yang cocok', () => {
    assert.equal(evaluatePurpose('equipment_purchase', 'SALE'), 1);
    assert.equal(evaluatePurpose('equipment_purchase', 'PAYOUT'), 1);
    assert.equal(evaluatePurpose('equipment_purchase', 'DOWN_PAYMENT'), 1);
    assert.equal(evaluatePurpose('software_subscription', 'RECURRING'), 1);
    assert.equal(evaluatePurpose('service_payment', 'INVOICE'), 1);
    assert.equal(evaluatePurpose('refund_issuance', 'REFUND'), 1);
    assert.equal(evaluatePurpose('other', 'TRANSFER'), 1);
  });

  // 2. test_dis_purpose_mismatch
  await t.test('test_dis_purpose_mismatch: C_purpose = 0 untuk kategori yang tidak cocok', () => {
    assert.equal(evaluatePurpose('equipment_purchase', 'REFUND'), 0);
    assert.equal(evaluatePurpose('software_subscription', 'SALE'), 0);
    assert.equal(evaluatePurpose('refund_issuance', 'PAYOUT'), 0);
    assert.equal(evaluatePurpose(null, 'SALE'), 0);
    assert.equal(evaluatePurpose('equipment_purchase', null), 0);
  });

  // 3. test_dis_amount_in_range
  await t.test('test_dis_amount_in_range: C_amount = 1 untuk amount dalam range', () => {
    const range = { min: '1000', max: '5000' };
    assert.equal(evaluateAmount(range, '1000'), 1);
    assert.equal(evaluateAmount(range, '3000'), 1);
    assert.equal(evaluateAmount(range, '5000'), 1);
    assert.equal(evaluateAmount(range, 2500), 1);
  });

  // 4. test_dis_amount_tolerance
  await t.test('test_dis_amount_tolerance: C_amount = 0.5 untuk amount dalam toleransi 10%', () => {
    const range = { min: '1000', max: '5000' };
    // Lower tolerance: 1000 * 0.9 = 900
    assert.equal(evaluateAmount(range, '950'), 0.5);
    assert.equal(evaluateAmount(range, '900'), 0.5);
    // Upper tolerance: 5000 * 1.1 = 5500
    assert.equal(evaluateAmount(range, '5200'), 0.5);
    assert.equal(evaluateAmount(range, '5500'), 0.5);
  });

  // 5. test_dis_amount_out_of_range
  await t.test('test_dis_amount_out_of_range: C_amount = 0 untuk amount di luar range & toleransi', () => {
    const range = { min: '1000', max: '5000' };
    assert.equal(evaluateAmount(range, '850'), 0);
    assert.equal(evaluateAmount(range, '6000'), 0);
    assert.equal(evaluateAmount(null, '1000'), 0);
    assert.equal(evaluateAmount(range, 'invalid-num'), 0);
  });

  // 6. test_dis_vendor_match
  await t.test('test_dis_vendor_match: C_vendor = 1 untuk vendor dalam kategori', () => {
    const allowed = ['electronics', 'computers', 'hardware'];
    assert.equal(evaluateVendor(allowed, 'electronics'), 1);
    assert.equal(evaluateVendor(allowed, 'COMPUTERS'), 1);
    assert.equal(evaluateVendor(allowed, 'Hardware'), 1);
    assert.equal(evaluateVendor([], 'any'), 1);
  });

  // 7. test_dis_vendor_neutral
  await t.test('test_dis_vendor_neutral: C_vendor = 0.5 untuk vendor tanpa kategori', () => {
    const allowed = ['electronics', 'computers'];
    assert.equal(evaluateVendor(allowed, null), 0.5);
    assert.equal(evaluateVendor(allowed, undefined), 0.5);
    assert.equal(evaluateVendor(allowed, ''), 0.5);
    // When provided but not matching -> 0
    assert.equal(evaluateVendor(allowed, 'furniture'), 0);
  });

  // 8. test_dis_brand_match
  await t.test('test_dis_brand_match: C_brand = 1 untuk brand dalam allowed', () => {
    const allowed = ['Apple', 'Dell'];
    assert.equal(evaluateBrand(allowed, 'Apple'), 1);
    assert.equal(evaluateBrand(allowed, 'dell'), 1);
    assert.equal(evaluateBrand([], 'Lenovo'), 0.5);
  });

  // 9. test_dis_brand_mismatch
  await t.test('test_dis_brand_mismatch: C_brand = 0 untuk brand di luar allowed', () => {
    const allowed = ['Apple', 'Dell'];
    assert.equal(evaluateBrand(allowed, 'Lenovo'), 0);
    assert.equal(evaluateBrand(allowed, 'HP'), 0);
    assert.equal(evaluateBrand(allowed, null), 0);
  });

  // 10. test_dis_attributes_all_pass
  await t.test('test_dis_attributes_all_pass: C_attributes = 1 untuk semua attribute terpenuhi', () => {
    const reqAttrs = [
      { key: 'ram_gb', operator: 'gte', value: 32 },
      { key: 'os', operator: 'eq', value: 'macOS' },
      { key: 'weight_kg', operator: 'lte', value: 2.0 },
      { key: 'tag', operator: 'contains', value: 'pro' },
      { key: 'screen', operator: 'in', value: ['14', '16'] },
      { key: 'color', operator: 'neq', value: 'pink' },
      { key: 'arch', operator: 'not_in', value: ['x86', 'mips'] },
    ];
    const extracted = {
      ram_gb: 32,
      os: 'macOS',
      weight_kg: 1.6,
      tag: 'MacBook Pro',
      screen: '16',
      color: 'silver',
      arch: 'arm64',
    };
    assert.equal(evaluateAttributes(reqAttrs, extracted), 1.0);
    assert.equal(evaluateAttributes([], {}), 1.0);
  });

  // 11. test_dis_attributes_partial
  await t.test('test_dis_attributes_partial: C_attributes = 0.5 untuk sebagian terpenuhi', () => {
    const reqAttrs = [
      { key: 'ram_gb', operator: 'gte', value: 32 },
      { key: 'storage_tb', operator: 'gte', value: 1 },
    ];
    // Meets ram_gb 32, but missing or failing storage_tb
    const extracted = { ram_gb: 32, storage_tb: 0.5 };
    assert.equal(evaluateAttributes(reqAttrs, extracted), 0.5);
  });

  // 12. test_dis_evidence_valid
  await t.test('test_dis_evidence_valid: C_evidence = 1 untuk semua evidence valid', async () => {
    const reasons = [
      { claim: 'RAM 32GB', evidence_ref: 'field:request.metadata.ram_gb', extracted_attributes: { ram_gb: 32 } },
      { claim: 'Price in budget', evidence_ref: 'field:request.amount_minor', extracted_attributes: { amount_minor: '180000' } },
      { claim: 'Invoice document attached', evidence_ref: 'doc:inv-001', extracted_attributes: { invoice_id: 'inv-001' } },
    ];
    const context = {
      orgId: 'org_1',
      transaction: { amount_minor: '180000', metadata: { ram_gb: 32 } },
      documents: [{ id: 'inv-001', filename: 'inv-001.pdf', injection_flags: [] }],
    };
    const score = await evaluateEvidence(reasons, context);
    assert.equal(score, 1.0);
  });

  // 13. test_dis_evidence_invalid
  await t.test('test_dis_evidence_invalid: C_evidence = 0 untuk evidence invalid', async () => {
    const reasons = [
      { claim: 'Unknown document', evidence_ref: 'doc:non-existent-doc-id', extracted_attributes: { test: 1 } },
      { claim: 'Missing field ref', evidence_ref: 'field:non.existent.path', extracted_attributes: { test: 2 } },
      { claim: 'Malformed evidence', evidence_ref: 'invalid-ref-format', extracted_attributes: { test: 3 } },
    ];
    const context = { orgId: 'org_1', transaction: {}, documents: [] };
    const score = await evaluateEvidence(reasons, context);
    assert.equal(score, 0);
  });

  // 14. test_dis_score_formula
  await t.test('test_dis_score_formula: DIS = 100 * (0.15*p + 0.15*a + 0.20*v + 0.10*b + 0.20*at + 0.20*e)', async () => {
    const intentAnchor = {
      structured_intent: {
        purpose: 'equipment_purchase',
        constraints: {
          amount_range: { min: '0', max: '200000' },
          vendor_categories: ['electronics'],
          allowed_brands: ['Apple', 'Dell'],
          required_attributes: [{ key: 'ram_gb', operator: 'gte', value: 32 }],
        },
      },
      intent_hash: 'sha256:dummy',
    };
    const transaction = {
      intent_id: 'tx_01HX',
      category: 'SALE',
      amount_minor: '180000',
      counterparty: { category: 'electronics' },
      metadata: { brand: 'Apple' },
    };
    const reasoningTrace = {
      request_id: 'tx_01HX',
      reasons: [
        { claim: 'RAM 32GB meets spec', evidence_ref: 'field:request.amount_minor', data_source: 'request_metadata', extracted_attributes: { ram_gb: 32 } },
        { claim: 'Cost is $1800', evidence_ref: 'field:request.amount_minor', data_source: 'request_metadata', extracted_attributes: { amount_minor: '180000' } },
        { claim: 'Authorized brand Apple', evidence_ref: 'field:request.amount_minor', data_source: 'request_metadata', extracted_attributes: { brand: 'Apple' } },
      ],
    };

    const dip = await computeDecisionIntegrityScore({
      orgId: 'org_1',
      transaction,
      intentAnchor,
      reasoningTrace,
    });

    assert.equal(dip.components.purpose, 1.0);
    assert.equal(dip.components.amount, 1.0);
    assert.equal(dip.components.vendor, 1.0);
    assert.equal(dip.components.brand, 1.0);
    assert.equal(dip.components.attributes, 1.0);
    assert.equal(dip.components.evidence, 1.0);
    assert.equal(dip.score, 100);
    assert.equal(dip.decision, 'AUTO_APPROVE');
    assert.equal(dip.hard_rule_triggered, null);
  });

  // 15. test_dis_hard_rule_brand
  await t.test('test_dis_hard_rule_brand: DIP_BRAND_MISMATCH -> REQUIRE_APPROVAL', async () => {
    const intentAnchor = {
      structured_intent: {
        purpose: 'equipment_purchase',
        constraints: {
          amount_range: { min: '0', max: '200000' },
          vendor_categories: ['electronics'],
          allowed_brands: ['Apple', 'Dell'],
          required_attributes: [{ key: 'ram_gb', operator: 'gte', value: 32 }],
        },
      },
      intent_hash: 'sha256:dummy',
    };
    const transaction = {
      intent_id: 'tx_01HX',
      category: 'SALE',
      amount_minor: '180000',
      counterparty: { category: 'electronics' },
      metadata: { brand: 'Lenovo' }, // Brand mismatch!
    };
    const reasoningTrace = {
      request_id: 'tx_01HX',
      reasons: [
        { claim: 'RAM 32GB', evidence_ref: 'field:request.amount_minor', data_source: 'request_metadata', extracted_attributes: { ram_gb: 32 } },
        { claim: 'Price $1800', evidence_ref: 'field:request.amount_minor', data_source: 'request_metadata', extracted_attributes: { amount_minor: '180000' } },
        { claim: 'Lenovo ThinkPad', evidence_ref: 'field:request.amount_minor', data_source: 'request_metadata', extracted_attributes: { brand: 'Lenovo' } },
      ],
    };

    const dip = await computeDecisionIntegrityScore({
      orgId: 'org_1',
      transaction,
      intentAnchor,
      reasoningTrace,
    });

    // Hard rule violation forces score to 0
    // test-changed: PRD 1.6 & Zero-Leak requirement - hard rule violation forces DIS score to 0
    assert.equal(dip.score, 0);
    // Hard rule brand mismatch triggers
    assert.equal(dip.hard_rule_triggered, 'DIP_BRAND_MISMATCH');
    assert.equal(dip.decision, 'REQUIRE_APPROVAL');
  });

  // 16. test_dis_hard_rule_attributes
  await t.test('test_dis_hard_rule_attributes: DIP_ATTRIBUTES_MISMATCH -> REQUIRE_APPROVAL', async () => {
    const intentAnchor = {
      structured_intent: {
        purpose: 'equipment_purchase',
        constraints: {
          amount_range: { min: '0', max: '200000' },
          vendor_categories: ['electronics'],
          allowed_brands: ['Apple'],
          required_attributes: [
            { key: 'ram_gb', operator: 'gte', value: 32 },
            { key: 'gpu_cores', operator: 'gte', value: 16 },
            { key: 'storage_tb', operator: 'gte', value: 2 },
          ],
        },
      },
    };
    const transaction = {
      intent_id: 'tx_01HX',
      category: 'SALE',
      amount_minor: '180000',
      counterparty: { category: 'electronics' },
      metadata: { brand: 'Apple' },
    };
    // Only 1 of 3 attributes met -> C_attributes = 1/3 = 0.33 < 0.5
    const reasoningTrace = {
      request_id: 'tx_01HX',
      reasons: [
        { claim: 'RAM 32GB', evidence_ref: 'field:request.amount_minor', data_source: 'request_metadata', extracted_attributes: { ram_gb: 32, gpu_cores: 8, storage_tb: 1 } },
        { claim: 'Apple M3 Pro', evidence_ref: 'field:request.amount_minor', data_source: 'request_metadata', extracted_attributes: { brand: 'Apple' } },
        { claim: 'Budget compliant', evidence_ref: 'field:request.amount_minor', data_source: 'request_metadata', extracted_attributes: { amount_minor: '180000' } },
      ],
    };

    const dip = await computeDecisionIntegrityScore({
      orgId: 'org_1',
      transaction,
      intentAnchor,
      reasoningTrace,
    });

    assert.ok(dip.components.attributes < 0.5);
    assert.equal(dip.hard_rule_triggered, 'DIP_ATTRIBUTES_MISMATCH');
    assert.equal(dip.decision, 'REQUIRE_APPROVAL');
  });

  // 17. test_dis_hard_rule_evidence
  await t.test('test_dis_hard_rule_evidence: DIP_EVIDENCE_INVALID -> REJECTED', async () => {
    const intentAnchor = {
      structured_intent: {
        purpose: 'equipment_purchase',
        constraints: {
          amount_range: { min: '0', max: '200000' },
          vendor_categories: ['electronics'],
          allowed_brands: ['Apple'],
        },
      },
    };
    const transaction = {
      intent_id: 'tx_01HX',
      category: 'SALE',
      amount_minor: '180000',
      counterparty: { category: 'electronics' },
    };
    // All evidence invalid -> C_evidence = 0 < 0.5
    const reasoningTrace = {
      request_id: 'tx_01HX',
      reasons: [
        { claim: 'Claim 1', evidence_ref: 'doc:non-existent-doc-1', data_source: 'invoice' },
        { claim: 'Claim 2', evidence_ref: 'doc:non-existent-doc-2', data_source: 'invoice' },
        { claim: 'Claim 3', evidence_ref: 'doc:non-existent-doc-3', data_source: 'invoice' },
      ],
    };

    const dip = await computeDecisionIntegrityScore({
      orgId: 'org_1',
      transaction,
      intentAnchor,
      reasoningTrace,
      documents: [],
    });

    assert.equal(dip.components.evidence, 0);
    assert.equal(dip.hard_rule_triggered, 'DIP_EVIDENCE_INVALID');
    assert.equal(dip.decision, 'REJECTED');
  });

  // 18. test_dis_threshold_critical
  await t.test('test_dis_threshold_critical: DIS < 50 -> REJECTED', async () => {
    const intentAnchor = {
      structured_intent: {
        purpose: 'equipment_purchase',
        constraints: {
          amount_range: { min: '0', max: '200000' },
          vendor_categories: ['electronics'],
          allowed_brands: [],
        },
      },
    };
    // Purpose mismatch (0), Amount out of range (0), Vendor mismatch (0)
    const transaction = {
      intent_id: 'tx_01HX',
      category: 'REFUND',
      amount_minor: '500000',
      counterparty: { category: 'furniture' },
    };
    const reasoningTrace = {
      request_id: 'tx_01HX',
      reasons: [
        { claim: 'Claim 1', evidence_ref: 'record:rec-001', data_source: 'invoice' },
        { claim: 'Claim 2', evidence_ref: 'record:rec-002', data_source: 'invoice' },
        { claim: 'Claim 3', evidence_ref: 'record:rec-003', data_source: 'invoice' },
      ],
    };

    const dip = await computeDecisionIntegrityScore({
      orgId: 'org_1',
      transaction,
      intentAnchor,
      reasoningTrace,
    });

    assert.ok(dip.score < 50);
    assert.equal(dip.decision, 'REJECTED');
    assert.equal(dip.hard_rule_triggered, 'DIP_CRITICAL');
  });

  // 19. test_dis_threshold_low
  await t.test('test_dis_threshold_low: 50 <= DIS < 80 -> REQUIRE_APPROVAL', async () => {
    const intentAnchor = {
      structured_intent: {
        purpose: 'equipment_purchase',
        constraints: {
          amount_range: { min: '0', max: '200000' },
          vendor_categories: ['electronics'],
          allowed_brands: [],
        },
      },
    };
    // Purpose match (1), Amount tolerance (0.5), Vendor neutral (0.5), brand empty (0.5), attrs empty (1.0), evidence (0.5)
    // DIS = 100 * (0.15*1 + 0.15*0.5 + 0.20*0.5 + 0.10*0.5 + 0.20*1 + 0.20*0.5) = 100 * (0.15 + 0.075 + 0.10 + 0.05 + 0.20 + 0.10) = 67.5 -> 68
    const transaction = {
      intent_id: 'tx_01HX',
      category: 'SALE',
      amount_minor: '210000', // within 10% tolerance of 200000
    };
    const reasoningTrace = {
      request_id: 'tx_01HX',
      reasons: [
        { claim: 'Claim 1', evidence_ref: 'record:rec-001', data_source: 'invoice' },
        { claim: 'Claim 2', evidence_ref: 'record:rec-002', data_source: 'invoice' },
        { claim: 'Claim 3', evidence_ref: 'record:rec-003', data_source: 'invoice' },
      ],
    };

    const dip = await computeDecisionIntegrityScore({
      orgId: 'org_1',
      transaction,
      intentAnchor,
      reasoningTrace,
    });

    assert.ok(dip.score >= 50 && dip.score < 80);
    assert.equal(dip.decision, 'REQUIRE_APPROVAL');
    assert.equal(dip.hard_rule_triggered, 'DIP_LOW_SCORE');
  });

  // 20. test_dis_threshold_pass
  await t.test('test_dis_threshold_pass: DIS >= 80 -> AUTO_APPROVE', async () => {
    const intentAnchor = {
      structured_intent: {
        purpose: 'equipment_purchase',
        constraints: {
          amount_range: { min: '0', max: '200000' },
          vendor_categories: ['electronics'],
          allowed_brands: ['Dell'],
        },
      },
    };
    const transaction = {
      intent_id: 'tx_01HX',
      category: 'SALE',
      amount_minor: '150000',
      counterparty: { category: 'electronics' },
      metadata: { brand: 'Dell' },
    };
    const reasoningTrace = {
      request_id: 'tx_01HX',
      reasons: [
        { claim: 'Spec ok', evidence_ref: 'field:request.amount_minor', data_source: 'request_metadata', extracted_attributes: { amount_minor: '150000', brand: 'Dell' } },
        { claim: 'Dell brand ok', evidence_ref: 'field:request.amount_minor', data_source: 'request_metadata', extracted_attributes: { brand: 'Dell' } },
        { claim: 'Category ok', evidence_ref: 'field:request.amount_minor', data_source: 'request_metadata', extracted_attributes: { brand: 'Dell' } },
      ],
    };

    const dip = await computeDecisionIntegrityScore({
      orgId: 'org_1',
      transaction,
      intentAnchor,
      reasoningTrace,
    });

    assert.ok(dip.score >= 80);
    assert.equal(dip.decision, 'AUTO_APPROVE');
    assert.equal(dip.hard_rule_triggered, null);
  });
});
