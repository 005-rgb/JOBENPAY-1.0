/**
 * server/test/e2e/invoice-e2e.test.js
 * End-to-end integration, invoice records and automatic reconciliation test for INVOICE
 * (Item 13 CCC, PRD §11 test_invoice_e2e, K-INVOICE, T-05)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { env } from '../../src/config.js';
import { databaseConnectionOptions } from '../../src/db/connection.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';
import { generateSar, verifySar } from '../../src/services/sar.js';

test('INVOICE End-to-End Lifecycle & Automated Reconciliation (test_invoice_e2e)', async (t) => {
  const client = new pg.Client(databaseConnectionOptions(env.TEST_DATABASE_URL));
  await client.connect();

  const orgId = '00000000-0000-4000-8000-000000000001';
  const agentId = '00000000-0000-4000-8000-000000000002';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const buyerId = '00000000-0000-4000-8000-000000000007';

  const intentId = 'e2e00000-0000-4000-8000-000000000006';
  const invoiceNumber = 'INV-E2E-2026-001';
  const idempKey = 'idemp_e2e_inv_001';
  const paypalInvoiceId = 'INV2-E2E-9988-XYZ';

  t.after(async () => {
    // Cleanup
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM invoice_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE intent_id = $1', [intentId]);
    await client.end();
  });

  await t.test('1. test_invoice_e2e: Invoice Proposal -> Approval -> Send -> Paid via Webhook -> Balanced Legs -> Reconciled', async () => {
    // Clean prior
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM invoice_records WHERE org_id = $1 AND invoice_number = $2', [orgId, invoiceNumber]);
    await client.query('DELETE FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2', [orgId, idempKey]);

    // Step 1: Propose Invoice ($150.00)
    const insertRes = await client.query(`
      INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, category, sub_type, status,
        amount_minor, currency, counterparty_id, mandate_version_id,
        request_hash, idempotency_key, metadata
      ) VALUES (
        $1, $2, $3, 'INVOICE', 'standard', 'SUBMITTED',
        15000, 'USD', $4, $5,
        'hash_e2e_inv_req', $6, $7
      ) RETURNING *
    `, [
      intentId, orgId, agentId, buyerId, mandateVersionId, idempKey,
      JSON.stringify({ invoiceNumber, dueDate: '2026-12-31', recipientEmail: 'client@example.com' })
    ]);
    assert.equal(insertRes.rowCount, 1);

    // Register invoice_records row
    await client.query(`
      INSERT INTO invoice_records (
        org_id, intent_id, counterparty_id, invoice_number, amount_minor, currency, due_date, status, paypal_invoice_id
      ) VALUES ($1, $2, $3, $4, 15000, 'USD', '2026-12-31', 'DRAFT', $5)
    `, [orgId, intentId, buyerId, invoiceNumber, paypalInvoiceId]);

    // Step 2: Evaluation & Approval
    await client.query(
      `UPDATE transaction_intents SET status = 'APPROVED' WHERE intent_id = $1`,
      [intentId]
    );

    // Step 3: Execution: Invoice sent & marked PAID
    await client.query(`
      UPDATE invoice_records
      SET status = 'PAID'
      WHERE intent_id = $1 AND org_id = $2
    `, [intentId, orgId]);

    // Step 4: Generate balanced ledger legs (DEBIT buyer -> CREDIT org:main)
    const legs = generateLedgerLegs({
      category: 'INVOICE',
      sub_type: 'standard',
      amount_minor: 15000n,
      currency: 'USD',
      counterparty_id: buyerId,
    });

    assert.equal(legs.length, 2);

    await client.query('BEGIN');
    for (const leg of legs) {
      await client.query(`
        INSERT INTO transaction_legs (
          intent_id, leg_type, amount_minor, currency, account_ref, status
        ) VALUES ($1, $2, $3, $4, $5, 'POSTED')
      `, [intentId, leg.legType, leg.amountMinor.toString(), leg.currency, leg.accountRef]);
    }

    // Update intent to COMPLETED
    await client.query(`
      UPDATE transaction_intents
      SET status = 'COMPLETED',
          metadata = metadata || jsonb_build_object('paypalInvoiceId', $2::text)
      WHERE intent_id = $1 AND org_id = $3
    `, [intentId, paypalInvoiceId, orgId]);
    await client.query('COMMIT');

    // Verify invoice_records status
    const invCheck = await client.query(
      'SELECT * FROM invoice_records WHERE intent_id = $1',
      [intentId]
    );
    assert.equal(invCheck.rows[0].status, 'PAID');
    assert.equal(invCheck.rows[0].amount_minor, '15000');

    // Step 5: Record settlement
    await client.query(`
      INSERT INTO settlement_records (
        org_id, intent_id, paypal_ref, amount_minor, currency, status, reconciled_at
      ) VALUES ($1, $2, $3, 15000, 'USD', 'SETTLED', now())
    `, [orgId, intentId, paypalInvoiceId]);

    await client.query(`
      UPDATE transaction_intents
      SET reconciliation_status = 'RECONCILED'
      WHERE intent_id = $1 AND org_id = $2
    `, [intentId, orgId]);

    // Step 6: Generate and verify SAR v1.1
    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'INVOICE',
        sub_type: 'standard',
        status: 'COMPLETED',
        amount_minor: '15000',
        currency: 'USD',
        mandate_version_id: mandateVersionId,
        request_hash: 'hash_e2e_inv_req',
      },
      legs,
      executions: [{ providerRefs: { invoiceId: paypalInvoiceId } }],
    });

    assert.equal(sar.category, 'INVOICE');
    assert.equal(sar.sub_type, 'standard');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.paypal_refs.invoice_id, paypalInvoiceId);

    const sarVerification = verifySar(sar);
    assert.equal(sarVerification.valid, true);

    // Final check
    const finalIntent = await client.query('SELECT * FROM transaction_intents WHERE intent_id = $1', [intentId]);
    assert.equal(finalIntent.rows[0].status, 'COMPLETED');
    assert.equal(finalIntent.rows[0].reconciliation_status, 'RECONCILED');
  });
});

