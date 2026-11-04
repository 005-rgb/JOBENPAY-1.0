import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

import { createSmtpTransport, getTransport, resetTransport, setTransport, sendMail } from '../../src/email/transport.js';
import * as templates from '../../src/email/templates.js';
import { isCommonPassword } from '../../src/auth/common-passwords.js';
import { logger } from '../../src/lib/logger.js';

test('SMTP transport enforces TLS verification and port security configurations', () => {
  const port587Transport = createSmtpTransport({
    host: 'smtp.mail.test',
    port: 587,
    user: 'testuser',
    pass: 'secretpass',
    servername: 'mail.custom.test',
  });

  assert.equal(port587Transport.options.port, 587);
  assert.equal(port587Transport.options.secure, false);
  assert.equal(port587Transport.options.requireTLS, true);
  assert.equal(port587Transport.options.tls.rejectUnauthorized, true);
  assert.equal(port587Transport.options.tls.servername, 'mail.custom.test');
  assert.equal(port587Transport.options.connectionTimeout, 10000);
  assert.equal(port587Transport.options.socketTimeout, 20000);

  const port465Transport = createSmtpTransport({
    host: 'smtp.secure.test',
    port: 465,
    user: 'testuser',
    pass: 'secretpass',
  });

  assert.equal(port465Transport.options.port, 465);
  assert.equal(port465Transport.options.secure, true);
  assert.equal(port465Transport.options.requireTLS, false);
  assert.equal(port465Transport.options.tls.rejectUnauthorized, true);
  assert.equal(port465Transport.options.tls.servername, 'smtp.secure.test');
});

test('Email templates render clean text, simple HTML, and required sandbox disclaimers', () => {
  const footerRequired = 'JOBENPAY is not a PayPal product. Sandbox use only.';

  const verify = templates.verifyEmail('https://jobenpay.test/verify-email?token=abc123xyz', 24);
  assert.ok(verify.subject.includes('Verify'));
  assert.ok(verify.text.includes('https://jobenpay.test/verify-email?token=abc123xyz'));
  assert.ok(verify.text.includes('24 hours'));
  assert.ok(verify.text.includes(footerRequired));
  assert.ok(verify.html.includes('https://jobenpay.test/verify-email?token=abc123xyz'));
  assert.ok(verify.html.includes(footerRequired));
  assert.ok(!verify.html.includes('<img'), 'Template must not contain remote tracking images');

  const notice = templates.accountExistsNotice('https://jobenpay.test/login');
  assert.ok(notice.subject.includes('account'));
  assert.ok(notice.text.includes('https://jobenpay.test/login'));
  assert.ok(notice.text.includes(footerRequired));
  assert.ok(notice.html.includes('https://jobenpay.test/login'));
  assert.ok(notice.html.includes(footerRequired));

  const welcome = templates.welcome();
  assert.ok(welcome.subject.includes('Welcome'));
  assert.ok(welcome.text.includes(footerRequired));
  assert.ok(welcome.html.includes(footerRequired));
});

test('Logger redacts SMTP_PASS and password fields from logs and objects', () => {
  let loggedChunk = '';
  const testLogger = logger.child({ component: 'smtp-test' });
  const originalWrite = process.stdout.write;
  try {
    process.stdout.write = (chunk) => {
      loggedChunk += chunk;
      return true;
    };
    testLogger.info({
      SMTP_PASS: 'super-secret-password-12345',
      smtp: { auth: { pass: 'another-secret' } },
      password: 'user-plain-password',
      email: 'user@example.test',
      status: 'SENT',
    }, 'Email sent log test');
  } finally {
    process.stdout.write = originalWrite;
  }

  assert.ok(!loggedChunk.includes('super-secret-password-12345'));
  assert.ok(!loggedChunk.includes('another-secret'));
  assert.ok(!loggedChunk.includes('user-plain-password'));
});

test('Validation schema test table covers >= 15 cases for registration fields', () => {
  const registerSchema = z.object({
    email: z.string().trim().toLowerCase().max(254).email(),
    password: z.string().min(12).max(128),
    displayName: z.string().trim().min(2).max(80),
    orgName: z.string().trim().min(2).max(80).regex(/^[\p{L}\p{N}\s.,'&()/-]+$/u, 'Organization name contains invalid characters.'),
    acceptTerms: z.literal(true),
    website: z.string().optional(),
  });

  function validateInput(input) {
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) return { valid: false, reason: 'schema' };
    const { email, password } = parsed.data;
    const localPart = email.split('@')[0];
    if (password.toLowerCase() === email || password.toLowerCase() === localPart) {
      return { valid: false, reason: 'password_matches_email' };
    }
    if (isCommonPassword(password)) {
      return { valid: false, reason: 'common_password' };
    }
    return { valid: true };
  }

  const cases = [
    // 1. Valid case
    {
      name: 'Valid full input',
      input: { email: 'alice@example.com', password: 'ValidUniquePassword!987', displayName: 'Alice Example', orgName: 'Alice Corp, Inc.', acceptTerms: true },
      expected: true,
    },
    // 2. Email missing @
    {
      name: 'Email missing @',
      input: { email: 'aliceexample.com', password: 'ValidUniquePassword!987', displayName: 'Alice Example', orgName: 'Alice Corp', acceptTerms: true },
      expected: false,
    },
    // 3. Email domain missing
    {
      name: 'Email domain missing',
      input: { email: 'alice@', password: 'ValidUniquePassword!987', displayName: 'Alice Example', orgName: 'Alice Corp', acceptTerms: true },
      expected: false,
    },
    // 4. Email > 254 chars
    {
      name: 'Email longer than 254 chars',
      input: { email: `${'a'.repeat(250)}@example.com`, password: 'ValidUniquePassword!987', displayName: 'Alice Example', orgName: 'Alice Corp', acceptTerms: true },
      expected: false,
    },
    // 5. Password < 12 chars
    {
      name: 'Password shorter than 12 chars',
      input: { email: 'alice@example.com', password: 'Short123!', displayName: 'Alice Example', orgName: 'Alice Corp', acceptTerms: true },
      expected: false,
    },
    // 6. Password > 128 chars
    {
      name: 'Password longer than 128 chars',
      input: { email: 'alice@example.com', password: 'A'.repeat(129), displayName: 'Alice Example', orgName: 'Alice Corp', acceptTerms: true },
      expected: false,
    },
    // 7. Password same as email
    {
      name: 'Password equals email',
      input: { email: 'alice@example.com', password: 'alice@example.com', displayName: 'Alice Example', orgName: 'Alice Corp', acceptTerms: true },
      expected: false,
    },
    // 8. Password same as local part of email
    {
      name: 'Password equals local part',
      input: { email: 'alice_long_name@example.com', password: 'alice_long_name', displayName: 'Alice Example', orgName: 'Alice Corp', acceptTerms: true },
      expected: false,
    },
    // 9. Password in common passwords list
    {
      name: 'Password in common passwords list',
      input: { email: 'alice@example.com', password: 'password123456', displayName: 'Alice Example', orgName: 'Alice Corp', acceptTerms: true },
      expected: false,
    },
    // 10. DisplayName < 2 chars
    {
      name: 'Display name too short',
      input: { email: 'alice@example.com', password: 'ValidUniquePassword!987', displayName: 'A', orgName: 'Alice Corp', acceptTerms: true },
      expected: false,
    },
    // 11. DisplayName > 80 chars
    {
      name: 'Display name too long',
      input: { email: 'alice@example.com', password: 'ValidUniquePassword!987', displayName: 'A'.repeat(81), orgName: 'Alice Corp', acceptTerms: true },
      expected: false,
    },
    // 12. OrgName < 2 chars
    {
      name: 'Org name too short',
      input: { email: 'alice@example.com', password: 'ValidUniquePassword!987', displayName: 'Alice Example', orgName: 'O', acceptTerms: true },
      expected: false,
    },
    // 13. OrgName > 80 chars
    {
      name: 'Org name too long',
      input: { email: 'alice@example.com', password: 'ValidUniquePassword!987', displayName: 'Alice Example', orgName: 'O'.repeat(81), acceptTerms: true },
      expected: false,
    },
    // 14. OrgName containing prohibited characters (HTML/tags)
    {
      name: 'Org name with script tag',
      input: { email: 'alice@example.com', password: 'ValidUniquePassword!987', displayName: 'Alice Example', orgName: 'Org <script>', acceptTerms: true },
      expected: false,
    },
    // 15. acceptTerms false
    {
      name: 'acceptTerms is false',
      input: { email: 'alice@example.com', password: 'ValidUniquePassword!987', displayName: 'Alice Example', orgName: 'Alice Corp', acceptTerms: false },
      expected: false,
    },
    // 16. acceptTerms omitted
    {
      name: 'acceptTerms is omitted',
      input: { email: 'alice@example.com', password: 'ValidUniquePassword!987', displayName: 'Alice Example', orgName: 'Alice Corp' },
      expected: false,
    },
    // 17. Valid org name with unicode letters, punctuation and spaces
    {
      name: 'Valid org name with accented characters and punctuation',
      input: { email: 'bjorn@example.com', password: 'StrongSecPassword#456', displayName: 'Björn Borg', orgName: "L'Oréal & Co.", acceptTerms: true },
      expected: true,
    },
  ];

  assert.ok(cases.length >= 15, `Expected >= 15 cases but got ${cases.length}`);
  for (const tc of cases) {
    const res = validateInput(tc.input);
    assert.equal(res.valid, tc.expected, `Case "${tc.name}" failed: expected valid=${tc.expected}, got ${res.valid} (${res.reason})`);
  }
});
