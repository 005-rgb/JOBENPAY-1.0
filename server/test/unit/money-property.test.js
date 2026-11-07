/**
 * server/test/unit/money-property.test.js
 * Property-based test untuk WP F2-2 money.js dengan ≥ 10.000 kasus acak.
 * 
 * Invarian yang diuji:
 * 1. fee + payee === total secara eksak tanpa selisih 1 sen pun.
 * 2. 0n <= fee <= total.
 * 3. bps = 0 -> fee === 0n, payee === total.
 * 4. bps = 10000 -> fee === total, payee === 0n.
 * 5. toMinor(fromMinor(x, curr), curr) === x (round-trip deterministik).
 * 6. Presisi angka moneter sangat besar (> 2^53, melampaui batas Number.MAX_SAFE_INTEGER).
 * 7. Eksponen mata uang 0 (JPY), 2 (USD), 3 (KWD).
 * 8. Penolakan desimal berlebih (EXCESS_DECIMAL_DIGITS).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toMinor,
  fromMinor,
  add,
  sub,
  cmp,
  mulBpsFloor,
  splitFee,
  assertPositive,
  sameCurrency,
  CURRENCY_EXPONENTS,
  getCurrencyExponent
} from '../../../shared/money.js';

test('F2-2: money.js property-based test with 10,000 randomized iterations', async (t) => {
  const ITERATIONS = 10000;
  const currencies = ['JPY', 'USD', 'EUR', 'GBP', 'KWD', 'BHD'];

  // Seeded pseudo-random PRNG untuk determinisme pengujian
  let seed = 123456789;
  function randInt(min, max) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const norm = seed / 4294967296;
    return Math.floor(norm * (max - min + 1)) + min;
  }

  function randBigInt(minDigits = 1, maxDigits = 20) {
    const digits = randInt(minDigits, maxDigits);
    let str = String(randInt(1, 9));
    for (let i = 1; i < digits; i++) {
      str += String(randInt(0, 9));
    }
    return BigInt(str);
  }

  await t.test(`10,000 iterations: fee + payee === total and 0 <= fee <= total`, () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const total = randBigInt(1, 18);
      const bps = BigInt(randInt(0, 10000));

      const { fee, payee } = splitFee(total, bps);

      // Invarian 1: zero-sum balance
      assert.equal(fee + payee, total, `Iteration ${i}: fee + payee must equal total`);

      // Invarian 2: bounds
      assert.ok(fee >= 0n, `Iteration ${i}: fee must be >= 0n`);
      assert.ok(fee <= total, `Iteration ${i}: fee must be <= total`);
      assert.ok(payee >= 0n, `Iteration ${i}: payee must be >= 0n`);
      assert.ok(payee <= total, `Iteration ${i}: payee must be <= total`);

      // Invarian boundary bps
      if (bps === 0n) {
        assert.equal(fee, 0n);
        assert.equal(payee, total);
      }
      if (bps === 10000n) {
        assert.equal(fee, total);
        assert.equal(payee, 0n);
      }
    }
  });

  await t.test(`10,000 iterations: toMinor(fromMinor(x)) === x round-trip across exponents 0, 2, 3`, () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const curr = currencies[i % currencies.length];
      const minor = randBigInt(1, 16);

      const str = fromMinor(minor, curr);
      const roundTrip = toMinor(str, curr);

      assert.equal(roundTrip, minor, `Iteration ${i}: round-trip mismatch for ${curr}: ${minor} -> ${str} -> ${roundTrip}`);
    }
  });

  await t.test('Ultra-large money amounts > 2^53 (beyond Number.MAX_SAFE_INTEGER)', () => {
    const beyondSafe = 900719925474099100000000000n; // ~ 10^26
    const bps = 250n; // 2.5%

    const { fee, payee } = splitFee(beyondSafe, bps);
    assert.equal(fee + payee, beyondSafe);
    assert.equal(fee, (beyondSafe * 250n) / 10000n);

    const str = fromMinor(beyondSafe, 'USD');
    const recovered = toMinor(str, 'USD');
    assert.equal(recovered, beyondSafe);
  });

  await t.test('Excess decimal digits are strictly rejected, not rounded', () => {
    // JPY: 0 desimal
    assert.throws(() => toMinor('100.1', 'JPY'), /EXCESS_DECIMAL_DIGITS/);

    // USD: 2 desimal
    assert.throws(() => toMinor('100.001', 'USD'), /EXCESS_DECIMAL_DIGITS/);

    // KWD: 3 desimal
    assert.throws(() => toMinor('100.0001', 'KWD'), /EXCESS_DECIMAL_DIGITS/);
  });

  await t.test('Arithmetic utilities: add, sub, cmp, assertPositive, sameCurrency', () => {
    assert.equal(add(100n, 50n), 150n);
    assert.equal(sub(100n, 40n), 60n);
    assert.equal(cmp(100n, 50n), 1);
    assert.equal(cmp(50n, 100n), -1);
    assert.equal(cmp(100n, 100n), 0);

    assert.doesNotThrow(() => assertPositive(1n));
    assert.throws(() => assertPositive(0n), /AMOUNT_NOT_POSITIVE/);
    assert.throws(() => assertPositive(-5n), /AMOUNT_NOT_POSITIVE/);

    assert.ok(sameCurrency('usd', 'USD'));
    assert.throws(() => sameCurrency('USD', 'EUR'), /CURRENCY_MISMATCH/);
    assert.throws(() => getCurrencyExponent('XYZ'), /UNSUPPORTED_CURRENCY/);
  });
});

