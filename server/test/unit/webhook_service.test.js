// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { PaymentWebhookService, handleWebhook } from '../../src/services/payment/webhook_service.js';
import { PaymentRouter } from '../../src/services/payment/payment_router.js';

test('PRD 4.1: WebhookService Unit & Functional Tests', async (t) => {
  let orgId;
  const testRunId = crypto.randomBytes(4).toString('hex');
  const router = new PaymentRouter();
  const service = new PaymentWebhookService({ router });

  t.before(async () => {
    const orgRes = await pool.query('SELECT id FROM organizations LIMIT 1');
    if (orgRes.rows.length === 0) {
      orgId = crypto.randomUUID();
      await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [orgId, 'Webhook Test Org', `org-${orgId.slice(0, 8)}`]);
    } else {
      orgId = orgRes.rows[0].id;
    }
  });

  t.after(async () => {
    await pool.query('DELETE FROM payment_webhook_events WHERE org_id = $1 AND gateway_event_id LIKE $2', [orgId, `%${testRunId}%`]);
    await pool.query('DELETE FROM payment_transactions WHERE org_id = $1 AND idempotency_key LIKE $2', [orgId, `%${testRunId}%`]);
  });

  await t.test('Validations: rejects missing or invalid parameters', async () => {
    // Missing orgId
    // @ts-ignore
    await assert.rejects(async () => service.handleWebhook({ gateway: 'STRIPE' }), /orgId is required/);

    // Unsupported gateway
    await assert.rejects(
      // @ts-ignore
      async () => service.handleWebhook({ orgId, gateway: 'UNKNOWN_GW' }),
      /Unsupported gateway/,
    );

    // Adapter not registered
    const emptyRouter = new PaymentRouter({ adapters: {} });
    const emptyService = new PaymentWebhookService({ router: emptyRouter });
    await assert.rejects(
      async () => emptyService.handleWebhook({ orgId, gateway: 'STRIPE', rawBody: '{}', signature: 'sig' }),
      /Adapter for gateway STRIPE is not registered/,
    );

    // Invalid signature
    await assert.rejects(
      async () => service.handleWebhook({ orgId, gateway: 'STRIPE', rawBody: '{}', signature: 'invalid_signature' }),
      /INVALID_WEBHOOK_SIGNATURE/,
    );

    // Missing event id
    await assert.rejects(
      async () => service.handleWebhook({ orgId, gateway: 'STRIPE', rawBody: JSON.stringify({ type: 'test' }), signature: 'valid_sig' }),
      /Missing gateway event identifier/,
    );
  });

  await t.test('Stripe and PayPal Webhook State Transitions', async () => {
    // Seed transactions for each scenario
    const reqId = crypto.randomUUID();
    const stripeTxId = `ch_stripe_${testRunId}`;
    const paypalTxId = `auth_paypal_${testRunId}`;

    await pool.query(
      `INSERT INTO payment_transactions (
         org_id, environment, request_id, gateway, gateway_tx_id, amount_minor, currency, status, idempotency_key
       ) VALUES ($1, 'SANDBOX', $2, 'STRIPE', $3, 1000, 'USD', 'AUTHORIZED', $4)`,
      [orgId, reqId, stripeTxId, `idem_stripe_${testRunId}`],
    );

    await pool.query(
      `INSERT INTO payment_transactions (
         org_id, environment, request_id, gateway, gateway_tx_id, amount_minor, currency, status, idempotency_key
       ) VALUES ($1, 'SANDBOX', $2, 'PAYPAL', $3, 2000, 'USD', 'AUTHORIZED', $4)`,
      [orgId, reqId, paypalTxId, `idem_paypal_${testRunId}`],
    );

    // 1. Stripe payment_intent.succeeded -> CAPTURED
    const stripeHook = await service.handleWebhook({
      orgId,
      gateway: 'STRIPE',
      rawBody: JSON.stringify({
        id: `evt_stripe_succ_${testRunId}`,
        type: 'payment_intent.succeeded',
        data: { object: { id: stripeTxId } },
      }),
      signature: 'valid_sig',
    });
    assert.equal(stripeHook.success, true);
    assert.equal(stripeHook.updatedTransaction.status, 'CAPTURED');

    // 2. Stripe charge.refunded -> REFUNDED
    const stripeRefundHook = await service.handleWebhook({
      orgId,
      gateway: 'STRIPE',
      rawBody: JSON.stringify({
        id: `evt_stripe_ref_${testRunId}`,
        type: 'charge.refunded',
        data: { object: { id: stripeTxId } },
      }),
      signature: 'valid_sig',
    });
    assert.equal(stripeRefundHook.success, true);
    assert.equal(stripeRefundHook.updatedTransaction.status, 'REFUNDED');

    // 3. PayPal PAYMENT.CAPTURE.COMPLETED -> CAPTURED
    const ppHook = await service.handleWebhook({
      orgId,
      gateway: 'PAYPAL',
      rawBody: JSON.stringify({
        id: `evt_pp_succ_${testRunId}`,
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: { id: paypalTxId },
      }),
      signature: 'valid_sig',
    });
    assert.equal(ppHook.success, true);
    assert.equal(ppHook.updatedTransaction.status, 'CAPTURED');

    // 4. PayPal PAYMENT.CAPTURE.PARTIALLY_REFUNDED -> PARTIALLY_REFUNDED
    const ppPartHook = await service.handleWebhook({
      orgId,
      gateway: 'PAYPAL',
      rawBody: JSON.stringify({
        id: `evt_pp_part_${testRunId}`,
        event_type: 'PAYMENT.CAPTURE.PARTIALLY_REFUNDED',
        resource: { id: paypalTxId },
      }),
      signature: 'valid_sig',
    });
    assert.equal(ppPartHook.success, true);
    assert.equal(ppPartHook.updatedTransaction.status, 'PARTIALLY_REFUNDED');

    // 5. Failure event -> FAILED
    const failTxId = `ch_stripe_fail_${testRunId}`;
    await pool.query(
      `INSERT INTO payment_transactions (
         org_id, environment, request_id, gateway, gateway_tx_id, amount_minor, currency, status, idempotency_key
       ) VALUES ($1, 'SANDBOX', $2, 'STRIPE', $3, 1000, 'USD', 'INITIATED', $4)`,
      [orgId, reqId, failTxId, `idem_fail_hook_${testRunId}`],
    );
    const failHook = await service.handleWebhook({
      orgId,
      gateway: 'STRIPE',
      rawBody: JSON.stringify({
        id: `evt_stripe_fail_${testRunId}`,
        type: 'payment_intent.payment_failed',
        data: { object: { id: failTxId } },
      }),
      signature: 'valid_sig',
    });
    assert.equal(failHook.success, true);
    assert.equal(failHook.updatedTransaction.status, 'FAILED');

    // 6. Generic/Adyen gateway webhook handling
    const mockAdyen = {
      verifyWebhook: async (raw) => ({ isValid: true, event: typeof raw === 'string' ? JSON.parse(raw) : raw }),
    };
    router.registerAdapter('ADYEN', mockAdyen);
    const adyenTxId = `tx_adyen_${testRunId}`;
    await pool.query(
      `INSERT INTO payment_transactions (
         org_id, environment, request_id, gateway, gateway_tx_id, amount_minor, currency, status, idempotency_key
       ) VALUES ($1, 'SANDBOX', $2, 'ADYEN', $3, 1000, 'USD', 'AUTHORIZED', $4)`,
      [orgId, reqId, adyenTxId, `idem_adyen_${testRunId}`],
    );
    const adyenHook = await service.handleWebhook({
      orgId,
      gateway: 'ADYEN',
      rawBody: JSON.stringify({
        id: `evt_adyen_${testRunId}`,
        type: 'charge.captured',
        tx_id: adyenTxId,
      }),
      signature: 'valid_adyen_sig',
    });
    assert.equal(adyenHook.success, true);
    assert.equal(adyenHook.updatedTransaction.status, 'CAPTURED');

    // 7. Test default export function
    const defRes = await handleWebhook({
      orgId,
      gateway: 'STRIPE',
      rawBody: JSON.stringify({
        id: `evt_default_export_${testRunId}`,
        type: 'customer.created',
      }),
      signature: 'valid_sig',
    });
    assert.equal(defRes.success, true);
  });
});
