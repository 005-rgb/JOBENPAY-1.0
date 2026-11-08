import test from 'node:test';
import assert from 'node:assert/strict';
import { FAIL_CLOSED_MATRIX, getFailClosedOutcome } from '../../../shared/fail-closed.js';

test('test_fail_closed_all_codes', () => {
  const expectedCodes = [
    'DB_UNAVAILABLE',
    'VLEI_REGISTRY_UNAVAILABLE',
    'INTENT_SERVICE_UNAVAILABLE',
    'DIP_INDETERMINATE',
    'CPL_REPLAY_UNAVAILABLE',
    'AI_UNAVAILABLE',
    'PAYPAL_UNAVAILABLE',
    'JPL_EVALUATION_ERROR',
    'SIGNATURE_INVALID',
    'REVOCATION_UNAVAILABLE',
    'UNKNOWN_ERROR',
  ];

  for (const code of expectedCodes) {
    const outcome = getFailClosedOutcome(code);
    assert.ok(outcome, `Missing outcome for ${code}`);
    assert.ok(['REJECT', 'REQUIRE_APPROVAL', 'DENY'].includes(outcome.outcome), `Invalid outcome value: ${outcome.outcome}`);
    assert.equal(typeof outcome.retry, 'boolean', `retry must be boolean for ${code}`);
    assert.ok(['critical', 'high', 'medium', 'low'].includes(outcome.alert), `Invalid alert severity: ${outcome.alert}`);
  }
});

test('test_fail_closed_unknown', () => {
  const fallback = getFailClosedOutcome('NON_EXISTENT_ERROR_CODE');
  assert.deepEqual(fallback, FAIL_CLOSED_MATRIX.UNKNOWN_ERROR);
  assert.equal(fallback.outcome, 'REJECT');
  assert.equal(fallback.retry, false);
  assert.equal(fallback.alert, 'critical');
});
