import assert from 'node:assert/strict';
import test from 'node:test';

import { env } from '../../src/config.js';
import { verifyGoogleIdToken, setGoogleVerifier, resetGoogleVerifier } from '../../src/auth/google.js';

function createMockJwt(claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://accounts.google.com',
    aud: env.GOOGLE_CLIENT_ID || 'mock-client-id',
    sub: '10987654321',
    email: 'alice@google.test',
    email_verified: true,
    name: 'Alice Google',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  })).toString('base64url');
  const signature = Buffer.from('signature').toString('base64url');
  return `${header}.${payload}.${signature}`;
}

test('verifyGoogleIdToken rejects empty or invalid token format', async () => {
  await assert.rejects(async () => verifyGoogleIdToken(''), {
    name: 'AppError',
    code: 'VALIDATION_FAILED',
  });

  await assert.rejects(async () => verifyGoogleIdToken(null), {
    name: 'AppError',
    code: 'VALIDATION_FAILED',
  });
});

test('verifyGoogleIdToken verifies valid JWT claims in test environment', async () => {
  const token = createMockJwt({
    email: 'testuser@google.test',
    name: 'Test Google User',
    sub: 'sub-12345',
  });

  const claims = await verifyGoogleIdToken(token);
  assert.equal(claims.email, 'testuser@google.test');
  assert.equal(claims.name, 'Test Google User');
  assert.equal(claims.sub, 'sub-12345');
});

test('verifyGoogleIdToken rejects expired token', async () => {
  const expiredToken = createMockJwt({
    exp: Math.floor(Date.now() / 1000) - 100,
  });

  await assert.rejects(async () => verifyGoogleIdToken(expiredToken), {
    name: 'AppError',
    code: 'GOOGLE_AUTH_FAILED',
    message: 'Google token has expired.',
  });
});

test('verifyGoogleIdToken rejects unverified email in token', async () => {
  const unverifiedToken = createMockJwt({
    email_verified: false,
  });

  await assert.rejects(async () => verifyGoogleIdToken(unverifiedToken), {
    name: 'AppError',
    code: 'GOOGLE_AUTH_FAILED',
    message: 'Google email is not verified.',
  });
});

test('verifyGoogleIdToken rejects token with audience mismatch', async () => {
  const originalClientId = env.GOOGLE_CLIENT_ID;
  try {
    env.GOOGLE_CLIENT_ID = 'expected-audience-123';
    const mismatchToken = createMockJwt({
      aud: 'different-audience-456',
    });

    await assert.rejects(async () => verifyGoogleIdToken(mismatchToken), {
      name: 'AppError',
      code: 'GOOGLE_AUTH_FAILED',
      message: 'Google token audience mismatch.',
    });
  } finally {
    env.GOOGLE_CLIENT_ID = originalClientId;
  }
});

test('verifyGoogleIdToken honors injectable custom verifier', async () => {
  try {
    setGoogleVerifier(async (token) => {
      if (token === 'valid-mock-token') {
        return {
          email: 'custom@google.test',
          name: 'Custom User',
          sub: 'custom-sub',
        };
      }
      const err = new Error('Invalid token');
      err.code = 'GOOGLE_AUTH_FAILED';
      throw err;
    });

    const result = await verifyGoogleIdToken('valid-mock-token');
    assert.equal(result.email, 'custom@google.test');
    assert.equal(result.name, 'Custom User');

    await assert.rejects(async () => verifyGoogleIdToken('bad-token'));
  } finally {
    resetGoogleVerifier();
  }
});

