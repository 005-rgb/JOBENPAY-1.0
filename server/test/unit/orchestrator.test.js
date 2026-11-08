// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { PaymentOrchestrator, defaultOrchestrator } from '../../src/services/payment/orchestrator.js';
import { PaymentRouter } from '../../src/services/payment/payment_router.js';

test('PRD 4.1: Orchestrator Unit & Edge Case Tests', async (t) => {
  let orgId;
  const testRunId = crypto.randomBytes(4).toString('hex');
  const router = new PaymentRouter();
  const orchestrator = new PaymentOrchestrator({ router });

  t.before(async () => {
    const orgRes = await pool.query('SELECT id FROM organizations LIMIT 1');
    if (orgRes.rows.length === 0) {
      orgId = crypto.randomUUID();
      await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [orgId, 'Orch Test Org', `org-${orgId.slice(0, 8)}`]);
    } else {
      orgId = orgRes.rows[0].id;
    }
  });

  t.after(async () => {
    await pool.query('DELETE FROM payment_transactions WHERE org_id = $1 AND idempotency_key LIKE $2', [orgId, `%${testRunId}%`]);
  });

  await t.test('createPayment validations: rejects missing or invalid parameters', async () => {
    const reqId = crypto.randomUUID();

    // Missing orgId
    // @ts-ignore
    await assert.rejects(async () => orchestrator.createPayment({}), /orgId is required/);

    // Missing requestId
    // @ts-ignore
    await assert.rejects(async () => orchestrator.createPayment({ orgId }), /requestId is required/);

    // Missing idempotencyKey
    // @ts-ignore
    await assert.rejects(async () => orchestrator.createPayment({ orgId, requestId: reqId }), /idempotencyKey is required/);

    // Invalid currency
    await assert.rejects(
      // @ts-ignore
      async () => orchestrator.createPayment({ orgId, requestId: reqId, idempotencyKey: 'k', currency: 'US' }),
      /currency must be a 3-letter ISO code/,
    );

    // Non-positive amount
    await assert.rejects(
      async () => orchestrator.createPayment({ orgId, requestId: reqId, idempotencyKey: 'k', currency: 'USD', amountMinor: 0n }),
      /amountMinor must be positive/,
    );

    // Missing token & paymentMethodId
    await assert.rejects(
      async () => orchestrator.createPayment({ orgId, requestId: reqId, idempotencyKey: 'k', currency: 'USD', amountMinor: 100n }),
      /Payment token or paymentMethodId is required/,
    );
  });

  await t.test('createPayment failure: hard decline marks transaction as FAILED in DB and throws', async () => {
    const reqId = crypto.randomUUID();
    const idemKey = `idem_fail_${testRunId}`;

    await assert.rejects(
      async () => orchestrator.createPayment({
        orgId,
        environment: 'SANDBOX',
        requestId: reqId,
        amountMinor: 2500n,
        currency: 'USD',
        token: 'tok_hard_decline',
        idempotencyKey: idemKey,
      }),
      (err) => {
        assert.equal(err.code, 'HARD_DECLINE');
        return true;
      },
    );

    // Transaction must exist in DB with status FAILED
    const dbTx = await pool.query('SELECT status, error_code FROM payment_transactions WHERE idempotency_key = $1', [idemKey]);
    assert.equal(dbTx.rows.length, 1);
    assert.equal(dbTx.rows[0].status, 'FAILED');
    assert.equal(dbTx.rows[0].error_code, 'HARD_DECLINE');
  });

  await t.test('capturePayment validations: rejects missing params, non-existent, and invalid state', async () => {
    // Missing orgId
    // @ts-ignore
    await assert.rejects(async () => orchestrator.capturePayment({}), /orgId is required/);

    // Missing txId
    // @ts-ignore
    await assert.rejects(async () => orchestrator.capturePayment({ orgId }), /txId is required/);

    // Missing idempotencyKey
    // @ts-ignore
    await assert.rejects(async () => orchestrator.capturePayment({ orgId, txId: crypto.randomUUID() }), /idempotencyKey is required/);

    // Not found
    const nonExistent = crypto.randomUUID();
    await assert.rejects(
      async () => orchestrator.capturePayment({ orgId, txId: nonExistent, idempotencyKey: 'k' }),
      /PAYMENT_NOT_FOUND/,
    );

    // Invalid state (e.g. attempting to capture a transaction that is already FAILED)
    const reqId = crypto.randomUUID();
    const failedTxRes = await pool.query(
      `INSERT INTO payment_transactions (
         org_id, environment, request_id, gateway, amount_minor, currency, status, idempotency_key
       ) VALUES ($1, 'SANDBOX', $2, 'STRIPE', 100, 'USD', 'FAILED', $3)
       RETURNING tx_id`,
      [orgId, reqId, `idem_failed_cap_${testRunId}`],
    );
    await assert.rejects(
      async () => orchestrator.capturePayment({ orgId, txId: failedTxRes.rows[0].tx_id, idempotencyKey: 'k' }),
      /INVALID_STATE/,
    );

    // Missing adapter on capture
    const noAdapterTxRes = await pool.query(
      `INSERT INTO payment_transactions (
         org_id, environment, request_id, gateway, gateway_tx_id, amount_minor, currency, status, idempotency_key
       ) VALUES ($1, 'SANDBOX', $2, 'UNKNOWN_GW', 'gw_tx_1', 100, 'USD', 'AUTHORIZED', $3)
       RETURNING tx_id`,
      [orgId, reqId, `idem_no_adapt_${testRunId}`],
    );
    await assert.rejects(
      async () => orchestrator.capturePayment({ orgId, txId: noAdapterTxRes.rows[0].tx_id, idempotencyKey: 'k' }),
      /ADAPTER_NOT_FOUND/,
    );

    // Failed capture from adapter
    const failCapRouter = new PaymentRouter();
    failCapRouter.registerAdapter('FAIL_CAP_GW', {
      capture: async () => ({ success: false, errorMessage: 'Capture rejected by issuer' }),
    });
    const failCapOrch = new PaymentOrchestrator({ router: failCapRouter });
    const failCapTxRes = await pool.query(
      `INSERT INTO payment_transactions (
         org_id, environment, request_id, gateway, gateway_tx_id, amount_minor, currency, status, idempotency_key
       ) VALUES ($1, 'SANDBOX', $2, 'FAIL_CAP_GW', 'gw_tx_2', 100, 'USD', 'AUTHORIZED', $3)
       RETURNING tx_id`,
      [orgId, reqId, `idem_fail_cap_${testRunId}_2`],
    );
    await assert.rejects(
      async () => failCapOrch.capturePayment({ orgId, txId: failCapTxRes.rows[0].tx_id, idempotencyKey: 'k' }),
      /CAPTURE_FAILED/,
    );
  });

  await t.test('refundPayment validations: rejects missing params, non-existent, and invalid state', async () => {
    // Missing orgId
    // @ts-ignore
    await assert.rejects(async () => orchestrator.refundPayment({}), /orgId is required/);

    // Missing txId
    // @ts-ignore
    await assert.rejects(async () => orchestrator.refundPayment({ orgId }), /txId is required/);

    // Missing idempotencyKey
    // @ts-ignore
    await assert.rejects(async () => orchestrator.refundPayment({ orgId, txId: crypto.randomUUID() }), /idempotencyKey is required/);

    // Not found
    const nonExistent = crypto.randomUUID();
    await assert.rejects(
      async () => orchestrator.refundPayment({ orgId, txId: nonExistent, idempotencyKey: 'k' }),
      /PAYMENT_NOT_FOUND/,
    );

    // Invalid state (e.g. attempting to refund a transaction that is still INITIATED)
    const reqId = crypto.randomUUID();
    const initTxRes = await pool.query(
      `INSERT INTO payment_transactions (
         org_id, environment, request_id, gateway, amount_minor, currency, status, idempotency_key
       ) VALUES ($1, 'SANDBOX', $2, 'STRIPE', 100, 'USD', 'INITIATED', $3)
       RETURNING tx_id`,
      [orgId, reqId, `idem_init_ref_${testRunId}`],
    );
    await assert.rejects(
      async () => orchestrator.refundPayment({ orgId, txId: initTxRes.rows[0].tx_id, idempotencyKey: 'k' }),
      /INVALID_STATE/,
    );

    // Missing adapter on refund
    const noAdapterRefRes = await pool.query(
      `INSERT INTO payment_transactions (
         org_id, environment, request_id, gateway, gateway_tx_id, amount_minor, currency, status, idempotency_key
       ) VALUES ($1, 'SANDBOX', $2, 'UNKNOWN_GW', 'gw_tx_3', 100, 'USD', 'CAPTURED', $3)
       RETURNING tx_id`,
      [orgId, reqId, `idem_no_adapt_ref_${testRunId}`],
    );
    await assert.rejects(
      async () => orchestrator.refundPayment({ orgId, txId: noAdapterRefRes.rows[0].tx_id, idempotencyKey: 'k' }),
      /ADAPTER_NOT_FOUND/,
    );

    // Failed refund from adapter
    const failRefRouter = new PaymentRouter();
    failRefRouter.registerAdapter('FAIL_REF_GW', {
      refund: async () => ({ success: false, errorMessage: 'Refund window expired' }),
    });
    const failRefOrch = new PaymentOrchestrator({ router: failRefRouter });
    const failRefTxRes = await pool.query(
      `INSERT INTO payment_transactions (
         org_id, environment, request_id, gateway, gateway_tx_id, amount_minor, currency, status, idempotency_key
       ) VALUES ($1, 'SANDBOX', $2, 'FAIL_REF_GW', 'gw_tx_4', 100, 'USD', 'CAPTURED', $3)
       RETURNING tx_id`,
      [orgId, reqId, `idem_fail_ref_${testRunId}`],
    );
    await assert.rejects(
      async () => failRefOrch.refundPayment({ orgId, txId: failRefTxRes.rows[0].tx_id, idempotencyKey: 'k' }),
      /REFUND_FAILED/,
    );

    // Successful partial refund
    const goodRefRouter = new PaymentRouter();
    goodRefRouter.registerAdapter('GOOD_REF_GW', {
      refund: async () => ({ success: true }),
    });
    const goodRefOrch = new PaymentOrchestrator({ router: goodRefRouter });
    const goodRefTxRes = await pool.query(
      `INSERT INTO payment_transactions (
         org_id, environment, request_id, gateway, gateway_tx_id, amount_minor, currency, status, idempotency_key
       ) VALUES ($1, 'SANDBOX', $2, 'GOOD_REF_GW', 'gw_tx_5', 200, 'USD', 'CAPTURED', $3)
       RETURNING tx_id`,
      [orgId, reqId, `idem_good_part_ref_${testRunId}`],
    );
    const partRefRes = await goodRefOrch.refundPayment({
      orgId,
      txId: goodRefTxRes.rows[0].tx_id,
      amountMinor: 50n,
      idempotencyKey: 'k_part',
      isPartial: true,
    });
    assert.equal(partRefRes.transaction.status, 'PARTIALLY_REFUNDED');

    // Create payment in PRODUCTION environment
    const prodRes = await orchestrator.createPayment({
      orgId,
      environment: 'PRODUCTION',
      requestId: crypto.randomUUID(),
      amountMinor: 1000n,
      currency: 'USD',
      token: 'tok_visa_valid',
      idempotencyKey: `idem_prod_${testRunId}`,
    });
    assert.equal(prodRes.transaction.environment, 'PRODUCTION');
  });

  await t.test('defaultOrchestrator instance is exported and operational', async () => {
    assert.ok(defaultOrchestrator instanceof PaymentOrchestrator);
  });
});
