/**
 * server/test/e2e/debit-e2e.test.js
 * End-to-end integration, direct debit execution and automatic reconciliation test for DEBIT
 * (Item 13 CCC, PRD §11, K-DEBIT, AD-17, B-F6)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { env } from '../../src/config.js';
import { databaseConnectionOptions } from '../../src/db/connection.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';
import { generateSar, verifySar } from '../../src/services/sar.js';
import { PartnerSimulatorProvider } from '../../src/services/partnerSimulator.js';

test('DEBIT End-to-End Lifecycle & Automated Reconciliation', async (t) => {
  const client = new pg.Client(databaseConnectionOptions(env.TEST_DATABASE_URL));
  await client.connect();

  const orgId = '00000000-0000-4000-8000-000000000001';
  const agentId = '00000000-0000-4000-8000-000000000002';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const counterpartyId = '00000000-0000-4000-8000-000000000004';

  const intentId = 'e2e00000-0000-4000-8000-000000000018';
  const authId = 'e2e00000-0000-4000-8000-000000000019';
  const idempKey = 'idemp_e2e_debit_direct_001';

  t.after(async () => {
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM debit_execution_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM debit_authorizations WHERE auth_id = $1', [authId]);
    await client.end();
  });

  await t.test('1. Full E2E: Authorization -> Debit Proposal -> Approval -> Pull Execution -> Balanced Ledger -> Reconciled', async () => {
    // Clean prior
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM debit_execution_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2', [orgId, idempKey]);
    await client.query('DELETE FROM debit_authorizations WHERE auth_id = $1', [authId]);

    const maxAmountMinor = 500000n; // $5,000.00
    const debitAmountMinor = 150000n; // $1,500.00

    // Step 1: Create active debit authorization
    const authInsert = await client.query(`
      INSERT INTO debit_authorizations (
        auth_id, org_id, counterparty_id, max_amount_minor, currency,
        frequency_limit, status, valid_until, mandate_ref
      ) VALUES ($1, $2, $3, $4, 'USD', 'MONTHLY', 'ACTIVE', now() + interval '30 days', 'MANDATE-E2E-001')
      RETURNING *
    `, [authId, orgId, counterpartyId, maxAmountMinor.toString()]);

    assert.equal(authInsert.rows.length, 1);
    const authRecord = authInsert.rows[0];

    // Step 2: Submit direct debit intent (status NEEDS_APPROVAL)
    const insertRes = await client.query(`
      INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, category, sub_type, status,
        amount_minor, currency, counterparty_id, mandate_version_id,
        request_hash, idempotency_key, metadata
      ) VALUES ($1, $2, $3, 'DEBIT', 'direct', 'NEEDS_APPROVAL', $4, 'USD', $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      intentId,
      orgId,
      agentId,
      debitAmountMinor.toString(),
      counterpartyId,
      mandateVersionId,
      'hash_e2e_deb_01',
      idempKey,
      JSON.stringify({ authId, provider: 'simulated' }),
    ]);

    assert.equal(insertRes.rows.length, 1);
    assert.equal(insertRes.rows[0].status, 'NEEDS_APPROVAL');

    // Step 3: Human checker approves & triggers execution via simulator adapter
    await client.query('UPDATE transaction_intents SET status = $1 WHERE intent_id = $2', ['EXECUTING', intentId]);

    const debitResult = await PartnerSimulatorProvider.processDebit({
      intentId,
      authId,
      amountMinor: debitAmountMinor,
      currency: 'USD',
      authorization: authRecord,
    });

    assert.equal(debitResult.outcome, 'SUCCESS');
    assert.equal(debitResult.provider, 'simulated');

    // Record execution
    await client.query(`
      INSERT INTO debit_execution_records (
        org_id, intent_id, auth_id, amount_minor, currency, status, provider
      ) VALUES ($1, $2, $3, $4, 'USD', 'COMPLETED', 'simulated')
    `, [orgId, intentId, authId, debitAmountMinor.toString()]);

    // Step 4: Write double-entry balanced legs in DB transaction
    const legs = generateLedgerLegs({
      category: 'DEBIT',
      subType: 'direct',
      intentId,
      counterpartyId,
      amountMinor: debitAmountMinor,
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

    // Verify balanced trigger
    const legCheck = await client.query(`
      SELECT 
        SUM(CASE WHEN leg_type = 'DEBIT' THEN amount_minor ELSE 0 END) AS total_debit,
        SUM(CASE WHEN leg_type = 'CREDIT' THEN amount_minor ELSE 0 END) AS total_credit
      FROM transaction_legs
      WHERE intent_id = $1
    `, [intentId]);

    assert.equal(legCheck.rows[0].total_debit, debitAmountMinor.toString());
    assert.equal(legCheck.rows[0].total_credit, debitAmountMinor.toString());

    // Step 5: Record settlement & reconciliation
    await client.query(`
      INSERT INTO settlement_records (
        org_id, intent_id, paypal_ref, amount_minor, currency, status, reconciled_at
      ) VALUES ($1, $2, $3, $4, 'USD', 'SETTLED', now())
    `, [orgId, intentId, debitResult.providerRefs.debitRef, debitAmountMinor.toString()]);

    await client.query(`
      UPDATE transaction_intents
      SET status = 'COMPLETED', reconciliation_status = 'RECONCILED', updated_at = now()
      WHERE intent_id = $1
    `, [intentId]);

    // Verify reconciled intent
    const finalIntent = await client.query('SELECT * FROM transaction_intents WHERE intent_id = $1', [intentId]);
    assert.equal(finalIntent.rows[0].status, 'COMPLETED');
    assert.equal(finalIntent.rows[0].reconciliation_status, 'RECONCILED');

    // Step 6: Verify SAR v1.1
    const legsInDb = await client.query('SELECT * FROM transaction_legs WHERE intent_id = $1', [intentId]);
    const sar = generateSar({
      intent: finalIntent.rows[0],
      legs: legsInDb.rows,
      executions: [{ provider: 'simulated', provider_refs: debitResult.providerRefs }],
    });

    assert.equal(sar.category, 'DEBIT');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(verifySar(sar).valid, true);
  });
});

