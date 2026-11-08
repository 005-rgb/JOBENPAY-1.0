// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { PaymentOrchestrator } from '../../src/services/payment/orchestrator.js';
import { PaymentWebhookService } from '../../src/services/payment/webhook_service.js';
import { VaultService } from '../../src/services/payment/vault_service.js';

test('PRD 4.1: POL State Machine & Orchestrator Integration Tests', async (t) => {
  let orgId;
  const testRunId = crypto.randomBytes(4).toString('hex');
  const orchestrator = new PaymentOrchestrator();
  const webhookService = new PaymentWebhookService();

  t.before(async () => {
    const orgRes = await pool.query('SELECT id FROM organizations LIMIT 1');
    if (orgRes.rows.length === 0) {
      orgId = crypto.randomUUID();
      await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [orgId, 'POL State Machine Org', `org-${orgId.slice(0, 8)}`]);
    } else {
      orgId = orgRes.rows[0].id;
    }
  });

  t.after(async () => {
    // Cleanup records created for this run
    await pool.query('DELETE FROM payment_transactions WHERE org_id = $1 AND idempotency_key LIKE $2', [orgId, `%${testRunId}%`]);
    await pool.query('DELETE FROM payment_webhook_events WHERE org_id = $1 AND gateway_event_id LIKE $2', [orgId, `%${testRunId}%`]);
    await pool.query('DELETE FROM payment_methods WHERE org_id = $1 AND customer_id = $2', [orgId, `00000000-0000-0000-0000-${testRunId.padStart(12, '0')}`]);
  });

  await t.test('test_tx_lifecycle_valid: INITIATED -> AUTHORIZED -> CAPTURED -> REFUNDED', async () => {
    const requestId = crypto.randomUUID();
    const idemKey = `idem_lifecycle_${testRunId}_1`;

    // 1. Authorize via Orchestrator (INITIATED -> AUTHORIZED)
    const authRes = await orchestrator.createPayment({
      orgId,
      environment: 'SANDBOX',
      requestId,
      amountMinor: 5000n,
      currency: 'USD',
      token: 'tok_visa_valid',
      idempotencyKey: idemKey,
    });

    assert.equal(authRes.success, true);
    assert.equal(authRes.transaction.status, 'AUTHORIZED');
    assert.equal(authRes.transaction.gateway, 'STRIPE');
    const txId = authRes.transaction.tx_id;

    // 2. Capture (AUTHORIZED -> CAPTURED)
    const capRes = await orchestrator.capturePayment({
      orgId,
      environment: 'SANDBOX',
      txId,
      idempotencyKey: `idem_cap_${testRunId}_1`,
    });

    assert.equal(capRes.success, true);
    assert.equal(capRes.transaction.status, 'CAPTURED');

    // 3. Refund (CAPTURED -> REFUNDED)
    const refRes = await orchestrator.refundPayment({
      orgId,
      environment: 'SANDBOX',
      txId,
      idempotencyKey: `idem_ref_${testRunId}_1`,
    });

    assert.equal(refRes.success, true);
    assert.equal(refRes.transaction.status, 'REFUNDED');

    // 4. Verify in DB
    const dbTx = await pool.query('SELECT status FROM payment_transactions WHERE tx_id = $1', [txId]);
    assert.equal(dbTx.rows[0].status, 'REFUNDED');
  });

  await t.test('test_tx_invalid_transition: DB trigger blocks illegal jumps', async () => {
    const requestId = crypto.randomUUID();
    const idemKey = `idem_illegal_${testRunId}`;

    const authRes = await orchestrator.createPayment({
      orgId,
      environment: 'SANDBOX',
      requestId,
      amountMinor: 1500n,
      currency: 'USD',
      token: 'tok_visa_valid',
      idempotencyKey: idemKey,
    });
    const txId = authRes.transaction.tx_id;

    // Capture to get to CAPTURED
    await orchestrator.capturePayment({
      orgId,
      environment: 'SANDBOX',
      txId,
      idempotencyKey: `idem_cap_ill_${testRunId}`,
    });

    // Try illegal transition: CAPTURED -> INITIATED
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

    // Try illegal transition: CAPTURED -> AUTHORIZED
    await assert.rejects(
      async () => {
        await pool.query(
          `UPDATE payment_transactions SET status = 'AUTHORIZED' WHERE tx_id = $1`,
          [txId],
        );
      },
      (err) => {
        assert.match(err.message, /ILLEGAL_TRANSITION/);
        return true;
      },
    );
  });

  await t.test('test_webhook_updates_state: Webhook transitions status & deduplicates', async () => {
    const requestId = crypto.randomUUID();
    const idemKey = `idem_hook_tx_${testRunId}`;

    // Create payment -> AUTHORIZED
    const authRes = await orchestrator.createPayment({
      orgId,
      environment: 'SANDBOX',
      requestId,
      amountMinor: 3000n,
      currency: 'USD',
      token: 'tok_visa_valid',
      idempotencyKey: idemKey,
    });
    const txId = authRes.transaction.tx_id;
    const gatewayTxId = authRes.transaction.gateway_tx_id;

    // Send webhook: payment_intent.succeeded for this transaction
    const webhookEventId = `evt_stripe_${testRunId}_hook1`;
    const payload = {
      id: webhookEventId,
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: gatewayTxId,
        },
      },
    };

    // First delivery -> processes successfully and updates status to CAPTURED
    const hookRes1 = await webhookService.handleWebhook({
      orgId,
      gateway: 'STRIPE',
      rawBody: JSON.stringify(payload),
      signature: 'valid_sig',
      environment: 'SANDBOX',
    });

    assert.equal(hookRes1.success, true);
    assert.equal(hookRes1.duplicate, false);

    const txAfterHook = await pool.query('SELECT status FROM payment_transactions WHERE tx_id = $1', [txId]);
    assert.equal(txAfterHook.rows[0].status, 'CAPTURED');

    // Second delivery (duplicate) -> recognized as duplicate, returns idempotent response
    const hookRes2 = await webhookService.handleWebhook({
      orgId,
      gateway: 'STRIPE',
      rawBody: JSON.stringify(payload),
      signature: 'valid_sig',
      environment: 'SANDBOX',
    });

    assert.equal(hookRes2.duplicate, true);
    assert.equal(hookRes2.eventId, hookRes1.eventId);
  });

  await t.test('test_orchestrator_vault_integration: pays with stored paymentMethodId', async () => {
    const custId = `00000000-0000-0000-0000-${testRunId.padStart(12, '0')}`;
    const token = `tok_visa_${crypto.randomBytes(6).toString('hex')}`;

    // Save token to Vault
    const saved = await VaultService.savePaymentMethod({
      orgId,
      environment: 'SANDBOX',
      customerId: custId,
      gateway: 'STRIPE',
      token,
      cardBrand: 'visa',
      cardLast4: '1111',
    });

    // Create payment referencing paymentMethodId
    const requestId = crypto.randomUUID();
    const idemKey = `idem_vault_pay_${testRunId}`;

    const res = await orchestrator.createPayment({
      orgId,
      environment: 'SANDBOX',
      requestId,
      customerId: custId,
      amountMinor: 4500n,
      currency: 'USD',
      paymentMethodId: saved.pm_id,
      idempotencyKey: idemKey,
    });

    assert.equal(res.success, true);
    assert.equal(res.transaction.status, 'AUTHORIZED');

    // Idempotent retry with same idempotencyKey returns existing record without duplicating
    const retryRes = await orchestrator.createPayment({
      orgId,
      environment: 'SANDBOX',
      requestId,
      customerId: custId,
      amountMinor: 4500n,
      currency: 'USD',
      paymentMethodId: saved.pm_id,
      idempotencyKey: idemKey,
    });

    assert.equal(retryRes.idempotent, true);
    assert.equal(retryRes.transaction.tx_id, res.transaction.tx_id);
  });
});
