export function toMinor(value) {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error('Money must be an integer minor value.');
    }
    return BigInt(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      throw new Error('Money strings must contain integer minor values only.');
    }
    return BigInt(trimmed);
  }

  throw new TypeError('Unsupported money type. Use bigint, integer number, or integer string.');
}

export function formatMinor(value) {
  return BigInt(value).toString();
}
