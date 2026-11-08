/**
 * server/test/unit/replay_engine.test.js
 * PRD 1.7 Replay Engine Unit Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  levenshteinDistance,
  reasonMatches,
  computeSemanticSimilarity,
  executeReplay,
} from '../../src/services/replay_engine.js';

test('Replay Engine Unit Tests', async (t) => {
  await t.test('test_levenshtein_distance: calculates accurate edit distance', () => {
    assert.equal(levenshteinDistance('apple', 'apple'), 0);
    assert.equal(levenshteinDistance('apple', 'apples'), 1);
    assert.equal(levenshteinDistance('kitten', 'sitting'), 3);
    assert.equal(levenshteinDistance('', 'test'), 4);
    assert.equal(levenshteinDistance('test', ''), 4);
  });

  await t.test('test_replay_reasoning_exact: exact reasons match', () => {
    const r1 = { claim: 'Invoice 101 matches PO', evidence_ref: 'doc:inv-101', data_source: 'invoice' };
    const r2 = { claim: 'Invoice 101 matches PO', evidence_ref: 'doc:inv-101', data_source: 'invoice' };
    assert.equal(reasonMatches(r1, r2), true);
  });

  await t.test('test_replay_reasoning_semantic: within 10% Levenshtein difference', () => {
    const r1 = { claim: 'Invoice 101 matches PO', evidence_ref: 'doc:inv-101', data_source: 'invoice' };
    const r2 = { claim: 'Invoice 101 matches PO.', evidence_ref: 'doc:inv-101', data_source: 'invoice' }; // 1 char diff (4.5%)
    assert.equal(reasonMatches(r1, r2), true);

    const reasons1 = [r1];
    const reasons2 = [r2];
    assert.equal(computeSemanticSimilarity(reasons1, reasons2), 1.0);
  });

  await t.test('test_replay_reasoning_mismatch: evidence_ref mismatch or distance > 10%', () => {
    const r1 = { claim: 'Invoice 101 matches PO', evidence_ref: 'doc:inv-101', data_source: 'invoice' };
    const r2 = { claim: 'Invoice 101 matches PO', evidence_ref: 'doc:inv-999', data_source: 'invoice' }; // diff ref
    assert.equal(reasonMatches(r1, r2), false);

    const r3 = { claim: 'Completely different claim', evidence_ref: 'doc:inv-101', data_source: 'invoice' };
    assert.equal(reasonMatches(r1, r3), false);

    assert.equal(computeSemanticSimilarity([r1], [r3]), 0.0);
  });

  await t.test('test_replay_decision_match_and_mismatch: executeReplay handles divergence', async () => {
    const snapshot = {
      snapshot_id: 'snap_01HX4Z8K9M2N3P4Q5R6S7T8V9W',
      request_id: 'req_1',
      org_id: 'org_1',
      model: {
        provider: 'openai',
        model_id: 'gpt-4o',
        model_version: '2024-08-06',
        temperature: 0,
        seed: 42,
      },
      inputs: {
        user_prompt_hash: 'sha256:1111',
        context_hash: 'sha256:2222',
        document_hashes: [],
      },
      outputs: {
        decision: 'APPROVED',
        reasoning_trace_hash: 'sha256:3333',
        raw_output_hash: 'sha256:4444',
      },
    };

    // 1. Perfect match
    const replayMatch = await executeReplay(snapshot);
    assert.equal(replayMatch.decision, 'APPROVED');
    assert.equal(replayMatch.reasoning_trace_hash, 'sha256:3333');
    assert.equal(replayMatch.raw_output_hash, 'sha256:4444');

    // 2. Decision mismatch divergence
    const replayDiff = await executeReplay(snapshot, { simulatedDivergence: 'DECISION_CHANGED' });
    assert.equal(replayDiff.decision, 'REJECTED');

    // 3. Raw mismatch divergence
    const replayRawDiff = await executeReplay(snapshot, { simulatedDivergence: 'RAW_CHANGED' });
    assert.equal(replayRawDiff.decision, 'APPROVED');
    assert.notEqual(replayRawDiff.raw_output_hash, 'sha256:4444');
  });

  await t.test('test_model_agnostic_execution: custom provider adapter executes cleanly', async () => {
    const snapshot = {
      model: { provider: 'anthropic', model_id: 'claude-3-5-sonnet', model_version: '20241022', temperature: 0, seed: 100 },
      inputs: {},
      outputs: { decision: 'REQUIRE_APPROVAL', reasoning_trace_hash: 'sha256:abc', raw_output_hash: 'sha256:def' },
    };

    const customAdapter = async (snap) => ({
      available: true,
      decision: snap.outputs.decision,
      reasoning_trace_hash: snap.outputs.reasoning_trace_hash,
      raw_output_hash: snap.outputs.raw_output_hash,
    });

    const result = await executeReplay(snapshot, { providerAdapter: customAdapter });
    assert.equal(result.decision, 'REQUIRE_APPROVAL');
  });
});
