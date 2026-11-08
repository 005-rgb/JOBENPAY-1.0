// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { PaymentOrchestrator } from '../../src/services/payment/orchestrator.js';
import { PaymentWebhookService } from '../../src/services/payment/webhook_service.js';

test('PRD 4.1: Webhook & State Machine Integration Tests (PRD §5.2)', async (t) => {
  let orgId;
  const testRunId = crypto.randomBytes(4).toString('hex');
  const orchestrator = new PaymentOrchestrator();
  const webhookService = new PaymentWebhookService();

  t.before(async () => {
    const orgRes = await pool.query('SELECT id FROM organizations LIMIT 1');
    if (orgRes.rows.length === 0) {
      orgId = crypto.randomUUID();
      await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [orgId, 'Webhook Int Org', `org-${orgId.slice(0, 8)}`]);
    } else {
      orgId = orgRes.rows[0].id;
    }
  });

  t.after(async () => {
    await pool.query('DELETE FROM payment_transactions WHERE org_id = $1 AND idempotency_key LIKE $2', [orgId, `%${testRunId}%`]);
    await pool.query('DELETE FROM payment_webhook_events WHERE org_id = $1 AND gateway_event_id LIKE $2', [orgId, `%${testRunId}%`]);
  });

  await t.test('test_tx_lifecycle_valid: INITIATED -> AUTHORIZED -> CAPTURED berhasil', async () => {
    const requestId = crypto.randomUUID();
    const idemKey = `idem_lifecycle_${testRunId}_wh`;

    // 1. Authorize: INITIATED -> AUTHORIZED
    const authRes = await orchestrator.createPayment({
      orgId,
      environment: 'SANDBOX',
      requestId,
      amountMinor: 10000n,
      currency: 'USD',
      token: 'tok_visa_valid',
      idempotencyKey: idemKey,
    });

    assert.equal(authRes.success, true);
    assert.equal(authRes.transaction.status, 'AUTHORIZED');
    const txId = authRes.transaction.tx_id;

    // 2. Capture: AUTHORIZED -> CAPTURED
    const capRes = await orchestrator.capturePayment({
      orgId,
      environment: 'SANDBOX',
      txId,
      idempotencyKey: `idem_cap_${testRunId}_wh`,
    });

    assert.equal(capRes.success, true);
    assert.equal(capRes.transaction.status, 'CAPTURED');

    // 3. Verifikasi DB
    const dbTx = await pool.query('SELECT status FROM payment_transactions WHERE tx_id = $1', [txId]);
    assert.equal(dbTx.rows[0].status, 'CAPTURED');
  });

  await t.test('test_tx_invalid_transition: CAPTURED -> INITIATED ditolak oleh trigger DB', async () => {
    const requestId = crypto.randomUUID();
    const idemKey = `idem_invalid_trans_${testRunId}`;

    const authRes = await orchestrator.createPayment({
      orgId,
      environment: 'SANDBOX',
      requestId,
      amountMinor: 5000n,
      currency: 'USD',
      token: 'tok_visa_valid',
      idempotencyKey: idemKey,
    });
    const txId = authRes.transaction.tx_id;

    await orchestrator.capturePayment({
      orgId,
      environment: 'SANDBOX',
      txId,
      idempotencyKey: `idem_cap_inv_${testRunId}`,
    });

    // Coba transisi ilegal: CAPTURED -> INITIATED
    await assert.rejects(
      async () => {
        await pool.query(
          `UPDATE payment_transactions SET status = 'INITIATED' WHERE tx_id = $1`,
          [txId],
        );
      },
      (err) => {
        assert.match(err.message, /ILLEGAL_TRANSITION/);
        return true;
      },
    );
  });

  await t.test('test_webhook_updates_state: Webhook dari Stripe mengubah status AUTHORIZED menjadi CAPTURED', async () => {
    const requestId = crypto.randomUUID();
    const idemKey = `idem_hook_stripe_${testRunId}`;

    // Buat pembayaran -> status AUTHORIZED
    const authRes = await orchestrator.createPayment({
      orgId,
      environment: 'SANDBOX',
      requestId,
      amountMinor: 8000n,
      currency: 'USD',
      token: 'tok_visa_valid',
      idempotencyKey: idemKey,
    });
    const txId = authRes.transaction.tx_id;
    const gatewayTxId = authRes.transaction.gateway_tx_id;

    // Webhook Stripe payment_intent.succeeded
    const webhookEventId = `evt_stripe_succ_${testRunId}`;
    const payload = {
      id: webhookEventId,
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: gatewayTxId,
        },
      },
    };

    const webhookRes = await webhookService.handleWebhook({
      orgId,
      gateway: 'STRIPE',
      rawBody: JSON.stringify(payload),
      signature: 'valid_sig',
      environment: 'SANDBOX',
    });

    assert.equal(webhookRes.success, true);
    assert.equal(webhookRes.duplicate, false);

    // Verifikasi status transaksi di database berubah menjadi CAPTURED
    const dbTx = await pool.query('SELECT status FROM payment_transactions WHERE tx_id = $1', [txId]);
    assert.equal(dbTx.rows[0].status, 'CAPTURED');
  });
});
