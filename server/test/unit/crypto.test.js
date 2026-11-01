import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

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
  const secondCiphertext = encrypt({ key, plaintext, aad: 'table:column:orgId' });
  assert.notEqual(ct, secondCiphertext);
  assert.equal(decrypt({ key, payload: ct, aad: 'table:column:orgId' }), plaintext);
  assert.throws(() => decrypt({ key, payload: ct, aad: 'table:column:other' }), /AAD/i);
  const corrupted = Buffer.from(ct, 'base64');
  corrupted[corrupted.length - 1] ^= 1;
  assert.throws(() => decrypt({ key, payload: corrupted.toString('base64'), aad: 'table:column:orgId' }));
});

test('scrypt password verification works', async () => {
  const password = 's3cret-pass';
  const hash = await hashPassword(password);
  assert.match(hash, /^scrypt\$32768\$8\$1\$[^$]+\$[^$]+$/);
  assert.equal(Buffer.from(hash.split('$')[4], 'base64').length, 16);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});

test('ed25519 sign and verify works and kid is stable', async () => {
  const { publicKey, privateKey } = await signEd25519.generateKeyPair('pkcs8');
  const message = 'payload';
  const signature = signEd25519(privateKey, message);
  assert.equal(verifyEd25519(publicKey, signature, message), true);
  const expectedKid = crypto.createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest('hex').slice(0, 16);
  assert.equal(kidFromPublicKey(publicKey), expectedKid);
  assert.equal(kidFromPublicKey(publicKey), kidFromPublicKey(publicKey));
});

test('sha256Hex returns stable hash', () => {
  assert.equal(sha256Hex('hello'), '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});
