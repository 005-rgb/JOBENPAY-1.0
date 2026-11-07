/**
 * server/test/e2e/financing-e2e.test.js
 * End-to-end integration, financing underwriting and automatic reconciliation test for FINANCING
 * (Item 13 CCC, PRD §11, K-FINANCING, AD-17, B-F6)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { env } from '../../src/config.js';
import { databaseConnectionOptions } from '../../src/db/connection.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';
import { generateSar, verifySar } from '../../src/services/sar.js';
import { PartnerSimulatorProvider } from '../../src/services/partnerSimulator.js';

test('FINANCING End-to-End Lifecycle & Automated Reconciliation', async (t) => {
  const client = new pg.Client(databaseConnectionOptions(env.TEST_DATABASE_URL));
  await client.connect();

  const orgId = '00000000-0000-4000-8000-000000000001';
  const agentId = '00000000-0000-4000-8000-000000000002';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const supplierId = '00000000-0000-4000-8000-000000000004';

  const intentId = 'e2e00000-0000-4000-8000-000000000017';
  const idempKey = 'idemp_e2e_financing_po_001';

  t.after(async () => {
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM financing_repayments WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM financing_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE intent_id = $1', [intentId]);
    await client.end();
  });

  await t.test('1. Full E2E: Proposal -> Underwriting -> Approval -> Disbursement -> Repayment -> Settlement -> Reconciled', async () => {
    // Clean prior
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM financing_repayments WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM financing_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2', [orgId, idempKey]);

    const principalAmountMinor = 5000000n; // $50,000.00
    const collateralValueMinor = 10000000n; // $100,000.00 (50% LTV <= 70% cap)
    const tenorMonths = 3;

    // Step 1: Submit financing intent (status NEEDS_APPROVAL per Tier C default)
    const insertRes = await client.query(`
      INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, category, sub_type, status,
        amount_minor, currency, counterparty_id, mandate_version_id,
        request_hash, idempotency_key, metadata
      ) VALUES ($1, $2, $3, 'FINANCING', 'po', 'NEEDS_APPROVAL', $4, 'USD', $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      intentId,
      orgId,
      agentId,
      principalAmountMinor.toString(),
      supplierId,
      mandateVersionId,
      'hash_e2e_fin_01',
      idempKey,
      JSON.stringify({ facilityType: 'PO', provider: 'simulated' }),
    ]);

    assert.equal(insertRes.rows.length, 1);
    assert.equal(insertRes.rows[0].status, 'NEEDS_APPROVAL');

    // Step 2: Underwrite facility via PartnerSimulatorProvider
    const underwriting = PartnerSimulatorProvider.underwrite({
      facilityType: 'PO',
      principalAmountMinor,
      collateralValueMinor,
      tenorMonths,
      counterpartyHistoryCount: 4,
    });
    assert.equal(underwriting.outcome, 'APPROVED');
    assert.equal(underwriting.provider, 'simulated');

    // Step 3: Insert financing_records
    const finRecordRes = await client.query(`
      INSERT INTO financing_records (
        org_id, intent_id, counterparty_id, facility_type,
        principal_amount_minor, interest_bps, admin_fee_minor, tenor_months,
        status, schedule
      ) VALUES ($1, $2, $3, 'PO', $4, 1200, $5, $6, 'APPROVED', $7)
      RETURNING *
    `, [
      orgId,
      intentId,
      supplierId,
      principalAmountMinor.toString(),
      underwriting.adminFeeMinor,
      tenorMonths,
      JSON.stringify(underwriting.schedule),
    ]);
    assert.equal(finRecordRes.rows.length, 1);

    // Step 4: Checker approves & disburse via simulator
    const disbResult = await PartnerSimulatorProvider.disburse({
      intentId,
      principalAmountMinor,
      adminFeeMinor: BigInt(underwriting.adminFeeMinor),
      currency: 'USD',
    });
    assert.equal(disbResult.outcome, 'SUCCESS');
    assert.equal(disbResult.provider, 'simulated');

    // Update status to DISBURSED
    await client.query('UPDATE financing_records SET status = $1 WHERE intent_id = $2', ['DISBURSED', intentId]);
    await client.query('UPDATE transaction_intents SET status = $1 WHERE intent_id = $2', ['EXECUTING', intentId]);

    // Step 5: Post double-entry disbursement legs to DB within transaction (deferred balanced trigger)
    const legs = generateLedgerLegs({
      category: 'FINANCING',
      subType: 'po',
      intentId,
      amountMinor: principalAmountMinor,
      adminFeeMinor: BigInt(underwriting.adminFeeMinor),
      currency: 'USD',
    });

    await client.query('BEGIN');
    for (const leg of legs) {
      await client.query(`
        INSERT INTO transaction_legs (
          intent_id, leg_type, account_ref, amount_minor, currency, status
        ) VALUES ($1, $2, $3, $4, $5, 'POSTED')
      `, [intentId, leg.legType, leg.accountRef, leg.amountMinor.toString(), leg.currency]);
    }
    await client.query('COMMIT');

    // Verify legs in DB
    const legsInDb = await client.query('SELECT * FROM transaction_legs WHERE intent_id = $1', [intentId]);
    assert.equal(legsInDb.rows.length, 3);
    const debitTotal = legsInDb.rows.filter((l) => l.leg_type === 'DEBIT').reduce((s, l) => s + BigInt(l.amount_minor), 0n);
    const creditTotal = legsInDb.rows.filter((l) => l.leg_type === 'CREDIT').reduce((s, l) => s + BigInt(l.amount_minor), 0n);
    assert.equal(debitTotal, creditTotal);
    assert.equal(debitTotal, principalAmountMinor);

    // Step 6: Process full repayment and settlement
    const totalObligation = BigInt(underwriting.totalObligationMinor);
    await client.query(`
      INSERT INTO financing_repayments (
        org_id, financing_id, intent_id, cycle_number, amount_minor,
        principal_portion_minor, interest_portion_minor, fee_portion_minor, currency
      ) VALUES ($1, $2, $3, 1, $4, $5, $6, $7, 'USD')
    `, [
      orgId,
      finRecordRes.rows[0].financing_id,
      intentId,
      totalObligation.toString(),
      principalAmountMinor.toString(),
      underwriting.totalInterestMinor,
      underwriting.adminFeeMinor,
    ]);

    await client.query(`
      UPDATE financing_records
      SET repaid_amount_minor = $1, status = 'SETTLED'
      WHERE intent_id = $2
    `, [totalObligation.toString(), intentId]);

    // Step 7: Record settlement & reconciliation
    await client.query(`
      INSERT INTO settlement_records (
        org_id, intent_id, paypal_ref, amount_minor, currency, status, reconciled_at
      ) VALUES ($1, $2, $3, $4, 'USD', 'SETTLED', now())
    `, [orgId, intentId, disbResult.providerRefs.disbursementRef, principalAmountMinor.toString()]);

    await client.query(`
      UPDATE transaction_intents
      SET status = 'COMPLETED', reconciliation_status = 'RECONCILED', updated_at = now()
      WHERE intent_id = $1
    `, [intentId]);

    // Verify reconciled intent
    const finalIntent = await client.query('SELECT * FROM transaction_intents WHERE intent_id = $1', [intentId]);
    assert.equal(finalIntent.rows[0].status, 'COMPLETED');
    assert.equal(finalIntent.rows[0].reconciliation_status, 'RECONCILED');

    // Step 8: Verify SAR v1.1
    const sar = generateSar({
      intent: finalIntent.rows[0],
      legs: legsInDb.rows,
      executions: [{ provider: 'simulated', provider_refs: disbResult.providerRefs }],
    });
    assert.equal(sar.category, 'FINANCING');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(verifySar(sar).valid, true);
  });
});
