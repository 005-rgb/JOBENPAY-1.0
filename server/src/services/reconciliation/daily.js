/**
 * server/src/services/reconciliation/daily.js
 * Daily Reconciliation Service across all 15 Categories (PRD 1.3 §7, WP F8-6)
 *
 * Compares transaction legs, settlement_records, and provider references.
 * Produces structured MISMATCH reports, alerts org admins, and generates
 * non-binding freeze recommendations.
 */

import { query } from '../../db/pool.js';
import { withTx } from '../../db/tx.js';
import { notifyOrgRoles } from '../../repositories/notifications.js';
import { logger } from '../../lib/logger.js';

/**
 * Reconciles an organization or global transaction batch.
 *
 * @param {Object} options
 * @param {string} [options.orgId] - Optional orgId scope. If omitted, checks all orgs.
 * @param {Object} [options.db] - Database client or pool.
 * @param {Date|string} [options.since] - Optional start timestamp.
 * @returns {Promise<Object>} Reconciliation summary report.
 */
export async function runDailyReconciliation({ orgId = null, db = { query }, since = null } = {}) {
  const params = [];
  let sql = `
    SELECT
      ti.id AS intent_id,
      ti.org_id,
      ti.category,
      ti.sub_type,
      ti.amount_minor,
      ti.currency,
      ti.status,
      ti.reconciliation_status,
      ti.created_at
    FROM transaction_intents ti
    WHERE ti.status IN ('COMPLETED', 'EXECUTED', 'RECONCILED', 'MISMATCH')
  `;

  if (orgId) {
    params.push(orgId);
    sql += ` AND ti.org_id = $${params.length}`;
  }

  if (since) {
    params.push(since);
    sql += ` AND ti.created_at >= $${params.length}`;
  }

  sql += ' ORDER BY ti.created_at ASC';

  const intentsRes = await db.query(sql, params);
  const intents = intentsRes.rows;

  let reconciledCount = 0;
  const mismatches = [];

  for (const intent of intents) {
    // 1. Fetch transaction legs for this intent
    const legsRes = await db.query(
      `SELECT direction, amount_minor, currency, account
       FROM transaction_legs
       WHERE intent_id = $1`,
      [intent.intent_id]
    );
    const legs = legsRes.rows;

    // 2. Fetch settlement records for this intent
    const settlementRes = await db.query(
      `SELECT paypal_ref, amount_minor, currency, status, reconciled_at
       FROM settlement_records
       WHERE intent_id = $1`,
      [intent.intent_id]
    );
    const settlement = settlementRes.rows[0] || null;

    // Calculate debits and credits
    let debitSum = 0n;
    let creditSum = 0n;
    let legsCurrency = intent.currency;

    for (const leg of legs) {
      const amt = BigInt(leg.amount_minor);
      legsCurrency = leg.currency;
      if (leg.direction === 'DEBIT') {
        debitSum += amt;
      } else if (leg.direction === 'CREDIT') {
        creditSum += amt;
      }
    }

    const intentAmount = BigInt(intent.amount_minor);
    let isMismatch = false;
    let mismatchReason = null;
    let diffMinor = 0n;
    let source = 'NONE';

    // Invariant 1: Transaction legs must strictly balance: SUM(DEBIT) == SUM(CREDIT)
    // Note: VOID and DISPUTE inquiry may have 0 legs
    const isExemptCategory = intent.category === 'VOID' || (intent.category === 'DISPUTE' && intent.sub_type === 'inquiry');
    if (!isExemptCategory) {
      if (legs.length === 0) {
        isMismatch = true;
        mismatchReason = 'MISSING_TRANSACTION_LEGS';
        source = 'LEGS';
      } else if (debitSum !== creditSum) {
        isMismatch = true;
        mismatchReason = 'UNBALANCED_TRANSACTION_LEGS';
        diffMinor = debitSum > creditSum ? debitSum - creditSum : creditSum - debitSum;
        source = 'LEGS';
      }
    }

    // Invariant 2: Settlement record match (when present)
    if (!isMismatch && settlement) {
      const settlementAmount = BigInt(settlement.amount_minor);
      if (settlement.currency !== intent.currency) {
        isMismatch = true;
        mismatchReason = 'CURRENCY_MISMATCH';
        source = 'SETTLEMENT';
      } else if (settlementAmount !== intentAmount) {
        isMismatch = true;
        mismatchReason = 'AMOUNT_MISMATCH';
        diffMinor = settlementAmount > intentAmount ? settlementAmount - intentAmount : intentAmount - settlementAmount;
        source = 'SETTLEMENT';
      } else if (settlement.status === 'FAILED' || settlement.status === 'MISMATCH') {
        isMismatch = true;
        mismatchReason = 'PROVIDER_SETTLEMENT_FAILED';
        source = 'PAYPAL';
      }
    }

    if (isMismatch) {
      mismatches.push({
        intentId: intent.intent_id,
        orgId: intent.org_id,
        category: intent.category,
        subType: intent.sub_type,
        expectedAmountMinor: intent.amount_minor,
        currency: intent.currency,
        diffMinor: diffMinor.toString(),
        source,
        reason: mismatchReason,
        suggestFreeze: true,
      });

      // Update intent status to MISMATCH
      await db.query(
        `UPDATE transaction_intents
         SET reconciliation_status = 'MISMATCH', updated_at = now()
         WHERE id = $1`,
        [intent.intent_id]
      );

      // Notify org administrators
      await notifyOrgRoles(
        db,
        intent.org_id,
        ['OWNER', 'ADMIN'],
        'TRANSACTION_MISMATCH',
        {
          intentId: intent.intent_id,
          category: intent.category,
          reason: mismatchReason,
          diffMinor: diffMinor.toString(),
          suggestFreeze: true,
        }
      ).catch((err) => {
        logger.error({ err, intentId: intent.intent_id }, 'Failed to send mismatch notification');
      });
    } else {
      reconciledCount++;
      if (intent.reconciliation_status !== 'RECONCILED') {
        await db.query(
          `UPDATE transaction_intents
           SET reconciliation_status = 'RECONCILED', updated_at = now()
           WHERE id = $1`,
          [intent.intent_id]
        );
      }
    }
  }

  const report = {
    scanned: intents.length,
    reconciled: reconciledCount,
    mismatchCount: mismatches.length,
    mismatches,
    suggestFreezeAny: mismatches.length > 0,
    generatedAt: new Date().toISOString(),
  };

  logger.info({ report }, 'Daily reconciliation job completed');
  return report;
}

