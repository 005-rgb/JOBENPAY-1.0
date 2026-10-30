import test from 'node:test';
import assert from 'node:assert/strict';

import { decrypt } from '../../src/lib/crypto.js';
import {
  maskPayeeIdentifier,
  normalizePayeeIdentifier,
  preparePayeeIdentifier,
} from '../../src/lib/payeeIdentifiers.js';

const encryptionKey = Buffer.alloc(32, 9).toString('base64');
const pepper = Buffer.alloc(32, 7).toString('base64');
const orgId = 'c3012389-a4ad-4ac8-8ff0-96d80a888225';

test('payee identifiers are encrypted with tenant AAD and normalized before HMAC', () => {
  const prepared = preparePayeeIdentifier(orgId, 'Payee@Example.Test', 'EMAIL', {
    encryptionKey,
    pepper,
  });
  assert.equal(
    decrypt({
      key: encryptionKey,
      payload: prepared.identifierEnc,
      aad: `payees:identifier_enc:${orgId}`,
    }),
    'Payee@Example.Test',
  );
  assert.equal(
    prepared.identifierHmac,
    preparePayeeIdentifier(orgId, 'payee@example.test', 'EMAIL', { encryptionKey, pepper }).identifierHmac,
  );
  assert.equal(normalizePayeeIdentifier('  Payee@Example.Test '), 'payee@example.test');
  assert.equal(prepared.identifierMasked, 'P***@Example.Test');
});

test('payee identifier masking does not expose a complete identifier', () => {
  assert.equal(maskPayeeIdentifier('1234567890', 'PHONE'), '***7890');
  assert.equal(maskPayeeIdentifier('a@sample.test', 'EMAIL'), 'a***@sample.test');
  assert.equal(maskPayeeIdentifier('1234', 'PAYPAL_ID'), '****');
});
