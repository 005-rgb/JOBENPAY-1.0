// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';
import { createSession } from '../../src/repositories/sessions.js';

async function createOrgUserAndSession(slugPrefix) {
  const orgId = crypto.randomUUID();
  const slug = `${slugPrefix}-${orgId.slice(0, 8)}`;
  await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [orgId, `Org ${slugPrefix}`, slug]);

  const userId = crypto.randomUUID();
  await pool.query(
    'INSERT INTO users (id, email, password_hash, display_name, email_verified_at) VALUES ($1, $2, $3, $4, now())',
    [userId, `owner-${slug}@jobenpay.test`, 'dummy-hash', `Owner ${slugPrefix}`]
  );
  await pool.query(
    'INSERT INTO memberships (org_id, user_id, role, is_judge) VALUES ($1, $2, $3, $4)',
    [orgId, userId, 'OWNER', false]
  );

  const csrfToken = crypto.randomUUID();
  const { token: sessionToken } = await createSession(orgId, {
    userId,
    currentOrgId: orgId,
    csrfSecret: csrfToken,
    expiresAt: new Date(Date.now() + 2 * 3600 * 1000),
  });

  return {
    orgId,
    userId,
    headers: {
      'content-type': 'application/json',
      'Cookie': `jp_sid=${sessionToken}`,
      'x-csrf-token': csrfToken,
      'x-jobenpay-environment': 'SANDBOX',
      'x-environment': 'SANDBOX',
    },
  };
}

test('PRD 4.1: Payment Orchestration Layer (POL) HTTP API Integration Suite', async (t) => {
  let testApp;
  let baseUrl;
  let authContext;
  const testRunId = crypto.randomBytes(4).toString('hex');

  t.before(async () => {
    testApp = await startTestApp();
    baseUrl = testApp.url;
    authContext = await createOrgUserAndSession(`pol-api-${testRunId}`);
  });

  t.after(async () => {
    if (authContext?.orgId) {
      await pool.query('DELETE FROM payment_transactions WHERE org_id = $1', [authContext.orgId]);
      await pool.query('DELETE FROM payment_methods WHERE org_id = $1', [authContext.orgId]);
      await pool.query('DELETE FROM payment_webhook_events WHERE org_id = $1', [authContext.orgId]);
    }
    await closeTestApp(testApp.server);
  });

  await t.test('1. GET /api/v1/payments/gateways: returns registry & routing config', async () => {
    const res = await fetch(`${baseUrl}/api/v1/payments/gateways`, {
      headers: authContext.headers,
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.gateways));
    assert.ok(body.gateways.some((g) => g.id === 'STRIPE'));
    assert.ok(body.gateways.some((g) => g.id === 'PAYPAL'));
    assert.equal(body.routingStrategy.smartFailover, true);
    assert.equal(body.routingStrategy.zeroPanStorage, true);
  });

  let createdPmId;
  await t.test('2. POST /api/v1/payments/vault: saves tokenized payment method (PCI DSS)', async () => {
    const custId = crypto.randomUUID();
    const res = await fetch(`${baseUrl}/api/v1/payments/vault`, {
      method: 'POST',
      headers: authContext.headers,
      body: JSON.stringify({
        customerId: custId,
        gateway: 'STRIPE',
        token: `tok_visa_${testRunId}`,
        cardMeta: {
          brand: 'visa',
          last4: '4242',
          expMonth: 12,
          expYear: 2028,
        },
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.paymentMethod);
    assert.equal(body.paymentMethod.card_last4, '4242');
    assert.equal(body.paymentMethod.is_default, true);
    createdPmId = body.paymentMethod.pm_id;
  });

  await t.test('3. POST /api/v1/payments/vault with raw PAN: rejected with 400 PCI_DSS_VIOLATION', async () => {
    const custId = crypto.randomUUID();
    const res = await fetch(`${baseUrl}/api/v1/payments/vault`, {
      method: 'POST',
      headers: authContext.headers,
      body: JSON.stringify({
        customerId: custId,
        gateway: 'STRIPE',
        token: '4111111111111111', // raw PAN forbidden
        cardMeta: { last4: '1111' },
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.code.includes('PCI_DSS_VIOLATION') || body.error.message.includes('PCI_DSS_VIOLATION'));
  });

  await t.test('4. GET /api/v1/payments/vault: lists tokenized methods for org', async () => {
    const res = await fetch(`${baseUrl}/api/v1/payments/vault`, {
      method: 'GET',
      headers: authContext.headers,
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.paymentMethods));
    assert.ok(body.paymentMethods.length >= 1);
    assert.ok(body.paymentMethods.some((pm) => pm.pm_id === createdPmId));
  });

  let executedTxId;
  await t.test('5. POST /api/v1/payments/execute: routes payment through orchestrator', async () => {
    const reqId = crypto.randomUUID();
    const idemKey = `idem_api_exec_${testRunId}`;

    const res = await fetch(`${baseUrl}/api/v1/payments/execute`, {
      method: 'POST',
      headers: {
        ...authContext.headers,
        'idempotency-key': idemKey,
      },
      body: JSON.stringify({
        requestId: reqId,
        token: 'tok_visa_valid',
        amountMinor: '25000',
        currency: 'USD',
        metadata: { orderId: 'ord_123' },
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.transaction);
    assert.equal(body.transaction.status, 'AUTHORIZED');
    assert.equal(body.transaction.amount_minor, '25000');
    executedTxId = body.transaction.tx_id;
  });

  await t.test('5b. POST /api/v1/payments/execute: handles non-UUID requestId and performs soft decline failover to PayPal', async () => {
    const idemKey = `idem_api_failover_${testRunId}`;

    const res = await fetch(`${baseUrl}/api/v1/payments/execute`, {
      method: 'POST',
      headers: {
        ...authContext.headers,
        'idempotency-key': idemKey,
      },
      body: JSON.stringify({
        requestId: 'req_non_uuid_simulator_test',
        token: 'tok_visa_soft_decline',
        amountMinor: '15000',
        currency: 'USD',
        metadata: { scenario: 'SOFT_DECLINE' },
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.transaction);
    assert.equal(body.transaction.gateway, 'PAYPAL');
    assert.equal(body.transaction.status, 'AUTHORIZED');
  });

  await t.test('6. POST /api/v1/payments/execute: requires idempotency key', async () => {
    const res = await fetch(`${baseUrl}/api/v1/payments/execute`, {
      method: 'POST',
      headers: authContext.headers,
      body: JSON.stringify({
        amountMinor: '1000',
        currency: 'USD',
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.code.includes('IDEMPOTENCY_KEY_REQUIRED') || body.error.message.includes('Idempotency'));
  });

  await t.test('7. POST /api/v1/payments/:txId/capture: captures authorized payment', async () => {
    const res = await fetch(`${baseUrl}/api/v1/payments/${executedTxId}/capture`, {
      method: 'POST',
      headers: {
        ...authContext.headers,
        'idempotency-key': `cap_api_${testRunId}`,
      },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.transaction.status, 'CAPTURED');
  });

  await t.test('8. POST /api/v1/payments/:txId/refund: refunds captured payment', async () => {
    const res = await fetch(`${baseUrl}/api/v1/payments/${executedTxId}/refund`, {
      method: 'POST',
      headers: {
        ...authContext.headers,
        'idempotency-key': `ref_api_${testRunId}`,
      },
      body: JSON.stringify({ amountMinor: '25000' }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.transaction.status, 'REFUNDED');
  });

  await t.test('9. GET /api/v1/payments/transactions: lists transactions with pagination', async () => {
    const res = await fetch(`${baseUrl}/api/v1/payments/transactions`, {
      method: 'GET',
      headers: authContext.headers,
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.items));
    assert.ok(body.items.length >= 1);
    assert.ok(body.items.some((tx) => tx.tx_id === executedTxId));
  });

  await t.test('10. GET /api/v1/payments/transactions/:txId: returns single transaction detail', async () => {
    const res = await fetch(`${baseUrl}/api/v1/payments/transactions/${executedTxId}`, {
      method: 'GET',
      headers: authContext.headers,
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.transaction);
    assert.equal(body.transaction.tx_id, executedTxId);
    assert.equal(body.transaction.status, 'REFUNDED');
  });

  await t.test('11. GET /api/v1/payments/stats: returns aggregated metrics', async () => {
    const res = await fetch(`${baseUrl}/api/v1/payments/stats`, {
      method: 'GET',
      headers: authContext.headers,
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.totalTransactions >= 1);
    assert.ok(body.byStatus);
  });

  await t.test('12. POST /webhooks/payments/:gateway: ingests signed webhook idempotently', async () => {
    // Top-level raw body webhook endpoint
    const evtId = `evt_api_hook_${testRunId}`;
    const payload = JSON.stringify({
      id: evtId,
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test_123', amount: 5000 } },
    });

    const res = await fetch(`${baseUrl}/webhooks/payments/stripe`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=123,v1=sig_valid_test',
      },
      body: payload,
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.received, true);

    // Calling again returns idempotent duplicate
    const res2 = await fetch(`${baseUrl}/webhooks/payments/stripe`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=123,v1=sig_valid_test',
      },
      body: payload,
    });
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.duplicate, true);
  });
});
