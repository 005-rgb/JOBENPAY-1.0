import crypto from 'node:crypto';
import { generateQrSvg } from './qrcode.js';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a buffer to RFC 4648 Base32
 */
export function encodeBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes an RFC 4648 Base32 string to Buffer
 */
export function decodeBase32(str) {
  const cleaned = String(str || '').toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates random Base32 secret for TOTP (default 20 bytes = 160 bits)
 */
export function generateTotpSecret(bytes = 20) {
  const buffer = crypto.randomBytes(bytes);
  return encodeBase32(buffer);
}

/**
 * Generates standard 6-digit TOTP code for a time step (RFC 6238)
 */
export function generateTotpCode(secretBase32, timeStep = Math.floor(Date.now() / 1000 / 30)) {
  const secret = decodeBase32(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(timeStep), 0);

  const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const codeNum = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;

  return codeNum.toString().padStart(6, '0');
}

/**
 * Verifies a 6-digit TOTP code with time drift window (default +/- 1 step = 30s)
 */
export function verifyTotpCode(secretBase32, code, window = 1) {
  const cleanedCode = String(code || '').trim();
  if (!/^\d{6}$/.test(cleanedCode)) {
    return false;
  }

  const currentStep = Math.floor(Date.now() / 1000 / 30);
  for (let i = -window; i <= window; i++) {
    const generated = generateTotpCode(secretBase32, currentStep + i);
    if (crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(cleanedCode))) {
      return true;
    }
  }

  return false;
}

/**
 * Generates OTPAuth URI
 */
export function generateOtpAuthUri({ email, secret, issuer = 'JOBENPAY' }) {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Formats a base32 secret in 4-character chunks for human display
 */
export function formatSecretForDisplay(secret) {
  return secret.match(/.{1,4}/g)?.join(' ') || secret;
}

/**
 * Complete TOTP setup payload with secret, QR code SVG, and URI
 */
export function generateTotpSetup({ email, issuer = 'JOBENPAY' }) {
  const secret = generateTotpSecret(20);
  const otpauthUrl = generateOtpAuthUri({ email, secret, issuer });
  const qrSvg = generateQrSvg(otpauthUrl, { size: 220, margin: 2 });
  const formattedSecret = formatSecretForDisplay(secret);

  return {
    secret,
    formattedSecret,
    otpauthUrl,
    qrSvg,
  };
}

export default {
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  generateOtpAuthUri,
  generateTotpSetup,
  decodeBase32,
  encodeBase32,
};
