import test from 'node:test';
import assert from 'node:assert/strict';

import {
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
  sha256Hex,
  signEd25519,
  verifyEd25519,
  kidFromPublicKey,
} from '../../src/lib/crypto.js';

test('AES encryption round-trip works and fails on different AAD', async () => {
  const key = '0123456789abcdef0123456789abcdef';
  const plaintext = 'hello-world';
  const ct = encrypt({ key, plaintext, aad: 'table:column:orgId' });
  assert.equal(decrypt({ key, payload: ct, aad: 'table:column:orgId' }), plaintext);
  assert.throws(() => decrypt({ key, payload: ct, aad: 'table:column:other' }), /AAD/i);
});

test('scrypt password verification works', async () => {
  const password = 's3cret-pass';
  const hash = await hashPassword(password);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});

test('ed25519 sign and verify works and kid is stable', async () => {
  const { publicKey, privateKey } = await signEd25519.generateKeyPair('pkcs8');
  const message = 'payload';
  const signature = signEd25519(privateKey, message);
  assert.equal(verifyEd25519(publicKey, signature, message), true);
  assert.equal(kidFromPublicKey(publicKey), kidFromPublicKey(publicKey));
});

test('sha256Hex returns stable hash', () => {
  assert.equal(sha256Hex('hello'), '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});
