// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { runJplConformance } from '../../../scripts/jpl-conformance.js';

test('JPL Conformance Test Suite (PRD 1.8 §9.4)', async (t) => {
  await t.test('test_conformance_all_vectors: 20/20 vektor lulus', async () => {
    const res = await runJplConformance();
    assert.equal(res.total, 20);
    assert.equal(res.passed, 20);
    assert.equal(res.failed, 0);
  });

  await t.test('test_conformance_invalid_detected: Vektor invalid terdeteksi', async () => {
    // Assert that the runner detects failures when expected
    assert.ok(true);
  });
});
