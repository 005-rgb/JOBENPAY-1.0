import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalJson } from '../../../shared/canonical.js';

test('canonicalJson sorts object keys and drops undefined values', () => {
  const value = {
    z: 2,
    a: undefined,
    nested: { b: 1, a: 2 },
    arr: [3, 1, 2],
  };

  assert.equal(canonicalJson(value), '{"arr":[3,1,2],"nested":{"a":2,"b":1},"z":2}');
});

test('canonicalJson matches the shared golden vector', () => {
  const value = { b: 1, a: { d: [3, 1], c: null, x: undefined } };
  assert.equal(canonicalJson(value), '{"a":{"c":null,"d":[3,1]},"b":1}');
});

test('canonicalJson rejects BigInt input', () => {
  assert.throws(() => canonicalJson({ amount: 1n }), /BigInt/i);
});
