import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  generateOtpAuthUri,
  generateTotpSetup,
  decodeBase32,
  encodeBase32,
} from '../../src/lib/totp.js';
import { generateQrSvg } from '../../src/lib/qrcode.js';
import { parseUserAgent } from '../../src/lib/user_agent.js';

test('Personal Settings: TOTP & QR Code Unit Tests', async (t) => {
  await t.test('Base32 encoding and decoding roundtrip', () => {
    const original = Buffer.from('JOBENPAY-Universal-Transaction-Engine-2026', 'utf8');
    const encoded = encodeBase32(original);
    const decoded = decodeBase32(encoded);
    assert.equal(decoded.toString('utf8'), original.toString('utf8'));
  });

  await t.test('generateTotpSecret produces valid 32-character base32 secret', () => {
    const secret = generateTotpSecret(20);
    assert.equal(secret.length, 32);
    assert.match(secret, /^[A-Z2-7]+$/);
  });

  await t.test('generateTotpCode produces 6-digit zero-padded string', () => {
    const secret = generateTotpSecret(20);
    const code = generateTotpCode(secret);
    assert.match(code, /^\d{6}$/);
  });

  await t.test('verifyTotpCode validates matching code and rejects invalid code', () => {
    const secret = generateTotpSecret(20);
    const validCode = generateTotpCode(secret);
    assert.equal(verifyTotpCode(secret, validCode), true);

    // Invalid code
    assert.equal(verifyTotpCode(secret, '000000' === validCode ? '111111' : '000000'), false);
    // Malformed code
    assert.equal(verifyTotpCode(secret, '123'), false);
    assert.equal(verifyTotpCode(secret, 'abcdef'), false);
  });

  await t.test('generateOtpAuthUri formats valid standard URI', () => {
    const uri = generateOtpAuthUri({
      email: 'user@example.com',
      secret: 'JBSWY3DPEHPK3PXP',
      issuer: 'JOBENPAY',
    });
    assert.ok(uri.startsWith('otpauth://totp/JOBENPAY:user%40example.com?secret=JBSWY3DPEHPK3PXP'));
    assert.ok(uri.includes('algorithm=SHA1'));
    assert.ok(uri.includes('digits=6'));
    assert.ok(uri.includes('period=30'));
  });

  await t.test('generateQrSvg produces SVG markup with crisp modules', () => {
    const svg = generateQrSvg('otpauth://totp/JOBENPAY:test?secret=ABC', { size: 200 });
    assert.ok(svg.includes('<svg'));
    assert.ok(svg.includes('viewBox="0 0 200 200"'));
    assert.ok(svg.includes('</svg>'));
  });

  await t.test('generateTotpSetup produces complete setup payload', () => {
    const setup = generateTotpSetup({ email: 'judge@jobenpay.io' });
    assert.ok(setup.secret);
    assert.ok(setup.formattedSecret);
    assert.ok(setup.otpauthUrl);
    assert.ok(setup.qrSvg);
    assert.ok(setup.qrSvg.startsWith('<svg'));
  });
});

test('Personal Settings: User-Agent Parser Unit Tests', async (t) => {
  await t.test('parses Windows 10/11 Chrome', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    const parsed = parseUserAgent(ua);
    assert.equal(parsed.browser, 'Google Chrome');
    assert.equal(parsed.os, 'Windows 10/11');
    assert.equal(parsed.label, 'Google Chrome on Windows 10/11');
  });

  await t.test('parses macOS Safari', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';
    const parsed = parseUserAgent(ua);
    assert.equal(parsed.browser, 'Apple Safari');
    assert.equal(parsed.os, 'macOS');
  });

  await t.test('parses Linux Firefox', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';
    const parsed = parseUserAgent(ua);
    assert.equal(parsed.browser, 'Mozilla Firefox');
    assert.equal(parsed.os, 'Linux');
  });

  await t.test('handles empty or unknown user agent gracefully', () => {
    const parsed = parseUserAgent('');
    assert.equal(parsed.browser, 'Web Browser');
  });
});
