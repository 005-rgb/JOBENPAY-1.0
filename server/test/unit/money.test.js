import test from 'node:test';
import assert from 'node:assert/strict';

import { formatMinor, toMinor } from '../../src/db/money.js';

test('toMinor converts non-negative integer values exactly', () => {
  assert.equal(toMinor('12345678901234567890'), 12345678901234567890n);
  assert.equal(toMinor(42), 42n);
  assert.equal(toMinor(7n), 7n);
  assert.equal(formatMinor(12345678901234567890n), '123456789012345678.90');
  assert.equal(formatMinor(1234n), '12.34');
  assert.equal(formatMinor(5n), '0.05');
});

test('toMinor rejects negative, fractional, unsafe, and non-finite amounts', () => {
  for (const value of [-1, -1n, '-1', '1.5', 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => toMinor(value));
  }
});

test('toMinor rejects unsupported input types', () => {
  assert.throws(() => toMinor(null), /Unsupported money type/);
});
