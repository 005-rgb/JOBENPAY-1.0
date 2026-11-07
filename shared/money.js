/**
 * shared/money.js
 * Standar Aritmatika Presisi Tinggi & Manipulasi Satuan Minor Moneter.
 * 
 * Aturan Pagar AD-13 & Golden Rule PRD 1.3:
 * 1. Seluruh nilai uang wajib BigInt dalam satuan minor.
 * 2. Dilarang Number/float/parseFloat pada nilai uang.
 * 3. Eksponen mata uang: 0 desimal (JPY, KRW, HUF, TWD), 2 desimal (USD, EUR, GBP, dll), 3 desimal (BHD, KWD, OMR).
 * 4. Input dengan jumlah desimal melebihi eksponen wajib ditolak (bukan dibulatkan implisit).
 * 5. splitFee(total, bps) menjamin fee + payee === total secara eksak.
 */

export const CURRENCY_EXPONENTS = Object.freeze({
  // 0 Desimal
  JPY: 0,
  HUF: 0,
  TWD: 0,
  KRW: 0,

  // 2 Desimal (Standar)
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  AUD: 2,
  SGD: 2,
  HKD: 2,
  NZD: 2,
  CHF: 2,
  BRL: 2,
  MXN: 2,
  ILS: 2,
  MYR: 2,
  PHP: 2,
  PLN: 2,
  SEK: 2,
  NOK: 2,
  DKK: 2,
  CZK: 2,
  THB: 2,
  IDR: 2,

  // 3 Desimal
  BHD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
});

export function getCurrencyExponent(currency = 'USD') {
  const code = String(currency).trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(CURRENCY_EXPONENTS, code)) {
    return CURRENCY_EXPONENTS[code];
  }
  throw new Error(`UNSUPPORTED_CURRENCY: Currency '${currency}' is not supported.`);
}

/**
 * Mengonversi nilai ke satuan minor (BigInt) tanpa float
 * Mendukung:
 * - BigInt langsung (misal 10000n)
 * - Integer number minor aman (misal 10000 -> 10000n)
 * - String minor integer (legacy: toMinor("10000"))
 * - String desimal eksak ber-currency (AD-13: toMinor("100.50", "USD"))
 */
export function toMinor(value, currency = undefined) {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new Error('Money minor values cannot be negative.');
    }
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('Money must be a non-negative safe integer minor value.');
    }
    return BigInt(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error('Money string cannot be empty.');
    }

    // Mode legacy: tanpa parameter currency, input harus berupa integer minor string
    if (currency === undefined) {
      if (!/^(0|[1-9]\d*)$/.test(trimmed)) {
        throw new Error('Money strings must contain non-negative integer minor values only.');
      }
      return BigInt(trimmed);
    }

    // Mode ber-currency (AD-13 & F2-2): parsing desimal presisi tinggi tanpa float
    const exp = getCurrencyExponent(currency);
    const parts = trimmed.split('.');

    if (parts.length > 2) {
      throw new Error(`INVALID_MONEY_FORMAT: Invalid decimal string '${value}'.`);
    }

    const intPart = parts[0];
    const decPart = parts[1] || '';

    if (!/^(0|[1-9]\d*)$/.test(intPart) || (parts.length === 2 && !/^\d+$/.test(decPart))) {
      throw new Error(`INVALID_MONEY_FORMAT: Malformed decimal amount '${value}'.`);
    }

    if (decPart.length > exp) {
      throw new Error(
        `EXCESS_DECIMAL_DIGITS: Currency '${currency}' allows at most ${exp} decimal digits, got ${decPart.length} in '${value}'.`
      );
    }

    const scale = 10n ** BigInt(exp);
    const intMinor = BigInt(intPart) * scale;
    const paddedDec = decPart.padEnd(exp, '0');
    const decMinor = paddedDec.length > 0 ? BigInt(paddedDec) : 0n;

    return intMinor + decMinor;
  }

  throw new TypeError('Unsupported money type. Expected BigInt, safe integer, or decimal string.');
}

/**
 * Mengonversi satuan minor (BigInt) ke representasi string desimal resmi
 */
export function fromMinor(minor, currency = 'USD') {
  const minorBig = BigInt(minor);
  const exp = getCurrencyExponent(currency);

  if (exp === 0) {
    return minorBig.toString();
  }

  const sign = minorBig < 0n ? '-' : '';
  const abs = minorBig < 0n ? -minorBig : minorBig;
  const scale = 10n ** BigInt(exp);

  const intPart = abs / scale;
  const decPart = String(abs % scale).padStart(exp, '0');

  return `${sign}${intPart}.${decPart}`;
}

export function formatMinor(minor, currency = 'USD') {
  return fromMinor(minor, currency);
}

export function add(a, b) {
  return BigInt(a) + BigInt(b);
}

export function sub(a, b) {
  return BigInt(a) - BigInt(b);
}

export function cmp(a, b) {
  const diff = BigInt(a) - BigInt(b);
  if (diff > 0n) return 1;
  if (diff < 0n) return -1;
  return 0;
}

export function mulBpsFloor(total, bps) {
  const totalBig = BigInt(total);
  const bpsBig = BigInt(bps);
  return (totalBig * bpsBig) / 10000n;
}

export function splitFee(total, bps) {
  const totalBig = BigInt(total);
  const fee = mulBpsFloor(totalBig, bps);
  const payee = totalBig - fee;
  return { fee, payee };
}

export function assertPositive(amount) {
  if (BigInt(amount) <= 0n) {
    throw new Error(`AMOUNT_NOT_POSITIVE: Amount must be strictly greater than 0, got ${amount}.`);
  }
}

export function sameCurrency(currA, currB) {
  const a = String(currA || '').trim().toUpperCase();
  const b = String(currB || '').trim().toUpperCase();
  if (a !== b) {
    throw new Error(`CURRENCY_MISMATCH: Cannot operate across currencies '${currA}' and '${currB}'.`);
  }
  return true;
}

export default {
  CURRENCY_EXPONENTS,
  getCurrencyExponent,
  toMinor,
  fromMinor,
  formatMinor,
  add,
  sub,
  cmp,
  mulBpsFloor,
  splitFee,
  assertPositive,
  sameCurrency,
};
