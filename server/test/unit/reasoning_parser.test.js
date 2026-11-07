// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReasoningTrace, containsPii } from '../../src/services/reasoning_parser.js';

test('PRD 1.6 §4 & §10 Reasoning Trace Parser Unit Tests', async (t) => {
  await t.test('containsPii correctly flags emails, phones, and SSNs', () => {
    assert.equal(containsPii('Valid engineering laptop specification with 32GB RAM'), false);
    assert.equal(containsPii('Contact john.doe@example.com for invoice approval'), true);
    assert.equal(containsPii('Call vendor at +1-555-123-4567 regarding order'), true);
    assert.equal(containsPii('Customer SSN is 123-45-6789'), true);
    assert.equal(containsPii(null), false);
    assert.equal(containsPii(''), false);
  });

  await t.test('parseReasoningTrace rejects non-object or missing request_id', () => {
    assert.throws(() => parseReasoningTrace(null), /must be an object/);
    assert.throws(() => parseReasoningTrace({}), /request_id is required/);
    assert.throws(() => parseReasoningTrace({ request_id: 'req_1', reasons: 'invalid' }), /must be an array/);
  });

  await t.test('parseReasoningTrace rejects trace with fewer than 3 reasons', () => {
    const raw = {
      request_id: 'req_01HX',
      reasons: [
        { claim: 'Reason 1', evidence_ref: 'doc:inv_1', data_source: 'invoice' },
        { claim: 'Reason 2', evidence_ref: 'field:request.amount_minor', data_source: 'request_metadata' },
      ],
    };
    assert.throws(() => parseReasoningTrace(raw), /minimum of 3 reasons/);
  });

  await t.test('parseReasoningTrace truncates trace with > 5 reasons to exactly 5', () => {
    const raw = {
      request_id: 'req_01HX',
      reasons: [
        { claim: 'R1', evidence_ref: 'doc:inv_1', data_source: 'invoice' },
        { claim: 'R2', evidence_ref: 'doc:inv_2', data_source: 'invoice' },
        { claim: 'R3', evidence_ref: 'doc:inv_3', data_source: 'invoice' },
        { claim: 'R4', evidence_ref: 'doc:inv_4', data_source: 'invoice' },
        { claim: 'R5', evidence_ref: 'doc:inv_5', data_source: 'invoice' },
        { claim: 'R6', evidence_ref: 'doc:inv_6', data_source: 'invoice' },
      ],
    };
    const parsed = parseReasoningTrace(raw);
    assert.equal(parsed.reasons.length, 5);
    assert.equal(parsed.reasons[0].claim, 'R1');
    assert.equal(parsed.reasons[4].claim, 'R5');
    assert.ok(parsed.trace_hash.startsWith('sha256:'));
    assert.equal(parsed.pii_detected, false);
  });

  await t.test('parseReasoningTrace detects PII in claim and sets pii_detected = true', () => {
    const raw = {
      request_id: 'req_01HX',
      reasons: [
        { claim: 'Laptop purchased from vendor contact admin@vendor.com', evidence_ref: 'doc:inv_1', data_source: 'invoice' },
        { claim: 'Standard pricing applies', evidence_ref: 'field:request.amount_minor', data_source: 'request_metadata' },
        { claim: 'Meets engineering requirements', evidence_ref: 'doc:inv_1', data_source: 'invoice' },
      ],
    };
    const parsed = parseReasoningTrace(raw);
    assert.equal(parsed.pii_detected, true);
  });

  await t.test('parseReasoningTrace rejects invalid reason structure', () => {
    const raw = {
      request_id: 'req_01HX',
      reasons: [
        { claim: 'Valid 1', evidence_ref: 'invalid-pattern-no-prefix', data_source: 'invoice' },
        { claim: 'Valid 2', evidence_ref: 'doc:123', data_source: 'invoice' },
        { claim: 'Valid 3', evidence_ref: 'doc:456', data_source: 'invoice' },
      ],
    };
    assert.throws(() => parseReasoningTrace(raw), /Invalid evidence_ref format/);
  });
});
