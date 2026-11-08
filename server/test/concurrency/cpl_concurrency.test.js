/**
 * server/test/concurrency/cpl_concurrency.test.js
 * PRD 1.7 CPL Concurrency & High-Throughput Replay Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { executeReplay } from '../../src/services/replay_engine.js';
import { computeReproducibilityScore } from '../../src/services/cpl_service.js';
import { createCognitiveSnapshotPayload } from '../../src/services/snapshot_service.js';

test('CPL Concurrency & High-Throughput Suite', async (t) => {
  const snapshot = createCognitiveSnapshotPayload({
    requestId: crypto.randomUUID(),
    orgId: crypto.randomUUID(),
    model: {
      provider: 'openai',
      model_id: 'gpt-4o',
      model_version: '2024-08-06',
      temperature: 0,
      seed: 42,
    },
    inputs: {
      user_prompt_hash: `sha256:${'a'.repeat(64)}`,
      context_hash: `sha256:${'b'.repeat(64)}`,
      document_hashes: [],
    },
    outputs: {
      decision: 'APPROVED',
      reasoning_trace_hash: `sha256:${'c'.repeat(64)}`,
      raw_output_hash: `sha256:${'d'.repeat(64)}`,
      decision_integrity_score: 95,
    },
  });

  await t.test('test_1000_parallel_replay: 1000 parallel replays execute in < 10 seconds', async () => {
    const startTime = Date.now();
    const tasks = Array.from({ length: 1000 }, async () => {
      const replay = await executeReplay(snapshot);
      const score = computeReproducibilityScore(replay, snapshot);
      return score;
    });

    const results = await Promise.all(tasks);
    const duration = Date.now() - startTime;

    assert.equal(results.length, 1000);
    for (const r of results) {
      assert.equal(r.reproducibility_score, 100);
      assert.equal(r.decision, 'AUTO_APPROVE');
    }

    assert.ok(duration < 10000, `Expected duration < 10000ms, got ${duration}ms`);
  });

  await t.test('test_replay_idempotent: multiple consecutive replays produce identical scores and components', async () => {
    const first = await executeReplay(snapshot);
    const firstScore = computeReproducibilityScore(first, snapshot);

    for (let i = 0; i < 50; i++) {
      const rep = await executeReplay(snapshot);
      const score = computeReproducibilityScore(rep, snapshot);
      assert.deepEqual(score, firstScore);
    }
  });
});
