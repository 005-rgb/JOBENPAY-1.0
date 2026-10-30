import { encrypt, hmacSha256 } from './crypto.js';

export function normalizePayeeIdentifier(identifier) {
  return String(identifier || '').trim().toLowerCase();
}

export function maskPayeeIdentifier(identifier, kind) {
  const value = String(identifier || '').trim();
  if (kind === 'EMAIL' && value.includes('@')) {
    const [local, ...domainParts] = value.split('@');
    return `${local.slice(0, 1) || '*'}***@${domainParts.join('@')}`;
  }
  if (value.length <= 4) {
    return '****';
  }
  return `***${value.slice(-4)}`;
}

export function preparePayeeIdentifier(orgId, identifier, kind, {
  encryptionKey,
  pepper,
}) {
  const value = String(identifier || '').trim();
  const normalized = normalizePayeeIdentifier(value);
  if (!orgId || !value || !normalized) {
    throw new TypeError('orgId and identifier are required.');
  }
  if (!encryptionKey) {
    throw new Error('JOBENPAY_ENC_KEY is required for payee identifiers.');
  }
  if (!pepper) {
    throw new Error('JOBENPAY_HMAC_PEPPER is required for payee identifiers.');
  }
  return {
    identifierEnc: encrypt({
      key: encryptionKey,
      plaintext: value,
      aad: `payees:identifier_enc:${orgId}`,
    }),
    identifierHmac: hmacSha256(pepper, normalized),
    identifierMasked: maskPayeeIdentifier(value, kind),
  };
}
