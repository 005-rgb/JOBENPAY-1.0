import test from 'node:test';
import assert from 'node:assert/strict';
import { URL } from 'node:url';

import { encrypt } from '../../src/lib/crypto.js';
import { clearPaypalTokenCache, paypalFor } from '../../src/paypal/client.js';
import { PAYPAL_API_BASE } from '../../src/paypal/constants.js';
import { createFakePaypalServer } from '../helpers/fake-paypal.js';

const encryptionKey = Buffer.alloc(32, 7).toString('base64');
const orgId = 'c3012389-a4ad-4ac8-8ff0-96d80a888225';

function credentialsDb() {
  const clientIdEnc = encrypt({
    key: encryptionKey,
    plaintext: 'test-client',
    aad: `paypal_connections:client_id_enc:${orgId}`,
  });
  const clientSecretEnc = encrypt({
    key: encryptionKey,
    plaintext: 'test-secret',
    aad: `paypal_connections:client_secret_enc:${orgId}`,
  });
  return {
    async query(_sql, params) {
      assert.equal(params[0], orgId);
      return {
        rowCount: 1,
        rows: [{ org_id: orgId, client_id_enc: clientIdEnc, client_secret_enc: clientSecretEnc }],
      };
    },
  };
}

test('PayPal client caches OAuth, keeps credentials out of errors, retries transient failures and preserves idempotency', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalOverride = process.env.PAYPAL_API_BASE_OVERRIDE;
  const fake = await createFakePaypalServer();
  process.env.NODE_ENV = 'test';
  process.env.PAYPAL_API_BASE_OVERRIDE = fake.baseUrl;
  clearPaypalTokenCache(orgId);

  try {
    const paypal = await paypalFor(orgId, { db: credentialsDb(), encryptionKey });
    fake.setTransientFailures('/v1/payments/payouts', 503, 1);
    const first = await paypal.request('POST', '/v1/payments/payouts', {
      body: {
        sender_batch_header: { sender_batch_id: 'test-batch' },
        items: [{ recipient_type: 'EMAIL', receiver: 'test@example.test', amount: { value: '1.00', currency: 'USD' } }],
      },
      idempotencyId: 'test-request-id',
    });
    const duplicate = await paypal.request('POST', '/v1/payments/payouts', {
      body: {
        sender_batch_header: { sender_batch_id: 'test-batch' },
        items: [{ recipient_type: 'EMAIL', receiver: 'test@example.test', amount: { value: '1.00', currency: 'USD' } }],
      },
      idempotencyId: 'test-request-id',
    });
    assert.deepEqual(duplicate, first);
    assert.equal(fake.uniquePayoutCount, 1);
    assert.equal(fake.getRequestCount('/v1/payments/payouts'), 3);
    assert.equal(fake.oauthCalls, 1);

    fake.setTransientFailures('/v1/payments/payouts', 503, 1);
    await assert.rejects(
      () => paypal.request('POST', '/v1/payments/payouts', {
        body: {
          sender_batch_header: { sender_batch_id: 'unsafe-batch' },
          items: [{ recipient_type: 'EMAIL', receiver: 'test@example.test', amount: { value: '1.00', currency: 'USD' } }],
        },
      }),
      (error) => error.code === 'PAYPAL_UNAVAILABLE',
    );
    assert.equal(fake.getRequestCount('/v1/payments/payouts'), 4);

    fake.setTransientFailures('/v1/payments/payouts/PAYOUT-1', 503, 1);
    const payout = await paypal.request('GET', '/v1/payments/payouts/PAYOUT-1');
    assert.equal(payout.batch_header.payout_batch_id, 'PAYOUT-1');
    assert.equal(fake.getRequestCount('/v1/payments/payouts/PAYOUT-1'), 2);
    assert.equal(fake.oauthCalls, 1);

    fake.setOauthStatus(401);
    clearPaypalTokenCache(orgId);
    await assert.rejects(
      () => paypalFor(orgId, { db: credentialsDb(), encryptionKey }).then((client) => client.testConnection()),
      (error) => {
        assert.equal(error.code, 'PAYPAL_AUTH_FAILED');
        const serialized = JSON.stringify(error.details);
        assert.equal(serialized.includes('test-secret'), false);
        assert.equal(serialized.includes('test-client'), false);
        return true;
      },
    );
  } finally {
    clearPaypalTokenCache(orgId);
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalOverride === undefined) {
      delete process.env.PAYPAL_API_BASE_OVERRIDE;
    } else {
      process.env.PAYPAL_API_BASE_OVERRIDE = originalOverride;
    }
    await fake.close();
  }
});

test('PayPal request paths cannot escape the configured API origin', async () => {
  const fake = await createFakePaypalServer();
  const originalNodeEnv = process.env.NODE_ENV;
  const originalOverride = process.env.PAYPAL_API_BASE_OVERRIDE;
  process.env.NODE_ENV = 'test';
  process.env.PAYPAL_API_BASE_OVERRIDE = fake.baseUrl;
  clearPaypalTokenCache(orgId);

  try {
    const paypal = await paypalFor(orgId, { db: credentialsDb(), encryptionKey });
    await assert.rejects(() => paypal.request('GET', '//attacker.invalid/steal'), /must be an absolute path/);
  } finally {
    clearPaypalTokenCache(orgId);
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalOverride === undefined) {
      delete process.env.PAYPAL_API_BASE_OVERRIDE;
    } else {
      process.env.PAYPAL_API_BASE_OVERRIDE = originalOverride;
    }
    await fake.close();
  }
});

test('PayPal API override is ignored outside test mode', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalOverride = process.env.PAYPAL_API_BASE_OVERRIDE;
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  process.env.NODE_ENV = 'production';
  process.env.PAYPAL_API_BASE_OVERRIDE = 'http://127.0.0.1:1';
  globalThis.fetch = async (url) => {
    requestedUrl = new URL(url);
    return globalThis.Response.json({ access_token: 'test-token', expires_in: 3600 });
  };
  clearPaypalTokenCache(orgId);

  try {
    const paypal = await paypalFor(orgId, { db: credentialsDb(), encryptionKey });
    await paypal.testConnection();
    assert.equal(requestedUrl.origin, new URL(PAYPAL_API_BASE).origin);
  } finally {
    clearPaypalTokenCache(orgId);
    globalThis.fetch = originalFetch;
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalOverride === undefined) {
      delete process.env.PAYPAL_API_BASE_OVERRIDE;
    } else {
      process.env.PAYPAL_API_BASE_OVERRIDE = originalOverride;
    }
  }
});
