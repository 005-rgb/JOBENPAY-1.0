export function toMinor(value) {
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
    if (!/^(0|[1-9]\d*)$/.test(trimmed)) {
      throw new Error('Money strings must contain non-negative integer minor values only.');
    }
    return BigInt(trimmed);
  }

  throw new TypeError('Unsupported money type. Use bigint, integer number, or integer string.');
}

export function formatMinor(value) {
  const minor = BigInt(value);
  const sign = minor < 0n ? '-' : '';
  const absolute = minor < 0n ? -minor : minor;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
