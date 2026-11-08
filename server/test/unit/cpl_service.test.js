/**
 * server/test/unit/cpl_service.test.js
 * PRD 1.7 CPL Service & RS Formula Unit Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CPL_WEIGHTS,
  evaluateRDecision,
  evaluateRReasoning,
  evaluateRRaw,
  computeReproducibilityScore,
} from '../../src/services/cpl_service.js';

test('CPL Service Unit Tests', async (t) => {
  await t.test('test_cpl_weights: exactly 0.50, 0.30, 0.20 totaling 1.00', () => {
    assert.equal(CPL_WEIGHTS.w_decision, 0.50);
    assert.equal(CPL_WEIGHTS.w_reasoning, 0.30);
    assert.equal(CPL_WEIGHTS.w_raw, 0.20);
    const sum = CPL_WEIGHTS.w_decision + CPL_WEIGHTS.w_reasoning + CPL_WEIGHTS.w_raw;
    assert.equal(sum, 1.00);
  });

  await t.test('test_rs_formula: RS = 100 * (0.50*d + 0.30*r + 0.20*raw)', () => {
    const snapshot = {
      outputs: {
        decision: 'APPROVED',
        reasoning_trace_hash: 'sha256:1111',
        raw_output_hash: 'sha256:2222',
      },
    };

    // Perfect match (1.0, 1.0, 1.0) -> RS = 100
    const perfectReplay = {
      decision: 'APPROVED',
      reasoning_trace_hash: 'sha256:1111',
      raw_output_hash: 'sha256:2222',
    };
    const perfectScore = computeReproducibilityScore(perfectReplay, snapshot);
    assert.equal(perfectScore.reproducibility_score, 100);
    assert.equal(perfectScore.components.decision, 1);
    assert.equal(perfectScore.components.reasoning, 1);
    assert.equal(perfectScore.components.raw, 1);
    assert.equal(perfectScore.decision, 'AUTO_APPROVE');

    // Decision match, reasoning match, raw mismatch (1.0, 1.0, 0) -> RS = 80
    const rawDiffReplay = {
      decision: 'APPROVED',
      reasoning_trace_hash: 'sha256:1111',
      raw_output_hash: 'sha256:differ',
    };
    const rawDiffScore = computeReproducibilityScore(rawDiffReplay, snapshot);
    assert.equal(rawDiffScore.reproducibility_score, 80);
    assert.equal(rawDiffScore.components.raw, 0);
    assert.equal(rawDiffScore.decision, 'REQUIRE_APPROVAL');
    assert.deepEqual(rawDiffScore.reason_codes, ['CPL_LOW_REPRODUCIBILITY']);

    // Decision match, semantic reasoning (1.0, 0.5, 0) -> RS = 65
    const semanticDiffReplay = {
      decision: 'APPROVED',
      reasoning_trace_hash: 'sha256:diff',
      raw_output_hash: 'sha256:differ',
      reasoning_trace: [{ claim: 'Invoice matches purchase order 1234.', evidence_ref: 'doc:1', data_source: 'invoice' }],
    };
    const semanticDiffScore = computeReproducibilityScore(semanticDiffReplay, snapshot, {
      originalReasons: [{ claim: 'Invoice matches purchase order 1234', evidence_ref: 'doc:1', data_source: 'invoice' }],
    });
    // 100 * (0.50 * 1 + 0.30 * 0.5 + 0.20 * 0) = 100 * (0.50 + 0.15) = 65
    assert.equal(semanticDiffScore.reproducibility_score, 65);
    assert.equal(semanticDiffScore.decision, 'REJECTED');
    assert.deepEqual(semanticDiffScore.reason_codes, ['CPL_CRITICAL']);

    // Complete mismatch (0, 0, 0) -> RS = 0
    const zeroReplay = {
      decision: 'REJECTED',
      reasoning_trace_hash: 'sha256:none',
      raw_output_hash: 'sha256:none',
    };
    const zeroScore = computeReproducibilityScore(zeroReplay, snapshot);
    assert.equal(zeroScore.reproducibility_score, 0);
    assert.equal(zeroScore.decision, 'REJECTED');
    assert.deepEqual(zeroScore.reason_codes, ['CPL_CRITICAL']);
  });

  await t.test('test_rs_thresholds: < 70 REJECT, 70-89 REQUIRE_APPROVAL, >= 90 AUTO_APPROVE', () => {
    const snap = { outputs: { decision: 'APPROVED', reasoning_trace_hash: 'h1', raw_output_hash: 'h2' } };

    // RS = 100 -> AUTO_APPROVE
    const s100 = computeReproducibilityScore({ decision: 'APPROVED', reasoning_trace_hash: 'h1', raw_output_hash: 'h2' }, snap);
    assert.equal(s100.decision, 'AUTO_APPROVE');

    // RS = 80 -> REQUIRE_APPROVAL (CPL_LOW_REPRODUCIBILITY)
    const s80 = computeReproducibilityScore({ decision: 'APPROVED', reasoning_trace_hash: 'h1', raw_output_hash: 'diff' }, snap);
    assert.equal(s80.decision, 'REQUIRE_APPROVAL');

    // RS = 50 -> REJECTED (CPL_CRITICAL)
    const s50 = computeReproducibilityScore({ decision: 'APPROVED', reasoning_trace_hash: 'diff', raw_output_hash: 'diff' }, snap);
    assert.equal(s50.decision, 'REJECTED');
  });
});
