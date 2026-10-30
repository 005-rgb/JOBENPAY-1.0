function canonicalize(value, seen = new WeakSet()) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'bigint') {
    throw new TypeError('BigInt is not allowed in canonicalJson output. Use a string for money values.');
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry, seen)).filter((entry) => entry !== undefined).join(',')}]`;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw new TypeError('Circular references are not allowed in canonicalJson.');
    }
    seen.add(value);

    const keys = Object.keys(value).sort();
    const body = keys
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`)
      .join(',');

    seen.delete(value);
    return `{${body}}`;
  }

  return JSON.stringify(value);
}

export function canonicalJson(value) {
  return canonicalize(value);
}
