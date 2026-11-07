/**
 * server/src/domain/journal.js
 * PRD-R §7 / BW-04: Double-Entry Journal Engine with Hash-Linked Evidence Ledger
 *
 * Provides:
 * - ensureAccounts(orgId, currency)
 * - post(tx, request, ruleId, amounts, step)
 * - reverse(tx, entryId, reason)
 * - verifyJournal(orgId)
 */

import crypto from 'node:crypto';
import { query } from '../db/pool.js';
import { appendEntry, computeLegsHash, LEDGER_TYPES } from '../services/ledger.js';
import { LEDGER_RULES } from '../../../shared/ledger-rules.js';

export async function ensureAccounts(orgId, currency = 'USD') {
  const standardAccounts = [
    { accountRef: 'org:main', kind: 'ORG', description: 'Organization main operational cash account' },
    { accountRef: 'paypal:fees', kind: 'FEES', description: 'PayPal processing fees account' },
    { accountRef: 'contra:refunds', kind: 'ORG', description: 'Contra revenue / refund account' },
    { accountRef: 'escrow:internal', kind: 'ESCROW_INTERNAL', description: 'Internal book escrow / transit account' },
  ];

  for (const acc of standardAccounts) {
    await query(
      `INSERT INTO ledger_accounts (account_ref, org_id, kind, currency, description)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (org_id, account_ref) DO NOTHING`,
      [acc.accountRef, orgId, acc.kind, currency, acc.description],
    );
  }
}

export async function post(tx, request, ruleId, options = {}, step = 'settlement') {
  const intentId = request.intent_id ?? request.id;
  const orgId = request.org_id;
  const currency = request.currency ?? 'USD';

  // Check idempotency: if legs already exist for this intent and step, do not duplicate
  const existing = await tx.query(
    `SELECT leg_id, intent_id, leg_type, amount_minor, currency, account_ref, status
     FROM transaction_legs
     WHERE intent_id = $1 AND external_ref = $2`,
    [intentId, `step:${step}:${ruleId}`],
  );

  if (existing.rows.length > 0) {
    const linesHash = computeLegsHash(existing.rows);
    return {
      posted: false,
      idempotent: true,
      legs: existing.rows,
      linesHash,
    };
  }

  // Derive legs from options or rule
  let legs = options.legs;
  if (!legs) {
    const ruleFn = options.ruleFn;
    if (ruleFn) {
      legs = ruleFn(request);
    } else {
      // Find rule in LEDGER_RULES
      for (const cat of Object.values(LEDGER_RULES)) {
        for (const sub of Object.values(cat)) {
          if (sub.ruleId === ruleId) {
            legs = sub.legs(request);
            break;
          }
        }
        if (legs) break;
      }
    }
  }

  if (!Array.isArray(legs) || legs.length === 0) {
    throw new Error(`Cannot post journal: no legs generated for rule ${ruleId}.`);
  }

  // Memory validation: balanced check per currency
  const sums = new Map();
  for (const leg of legs) {
    const cur = leg.currency ?? currency;
    const curSums = sums.get(cur) || { debit: 0n, credit: 0n };
    const amt = BigInt(leg.amountMinor ?? leg.amount_minor);
    if (amt <= 0n) {
      throw new Error(`Journal leg amount must be positive, got ${amt}.`);
    }
    const legType = (leg.legType ?? leg.leg_type).toUpperCase();
    if (legType === 'DEBIT') {
      curSums.debit += amt;
    } else if (legType === 'CREDIT') {
      curSums.credit += amt;
    } else {
      throw new Error(`Invalid leg type ${legType}.`);
    }
    sums.set(cur, curSums);
  }

  for (const [cur, sum] of sums) {
    if (sum.debit !== sum.credit) {
      throw new Error(`Unbalanced journal legs for currency ${cur}: debit ${sum.debit} != credit ${sum.credit}.`);
    }
  }

  // Insert legs into transaction_legs
  const insertedLegs = [];
  const externalRef = `step:${step}:${ruleId}`;

  for (const leg of legs) {
    const legType = (leg.legType ?? leg.leg_type).toUpperCase();
    const amountMinor = BigInt(leg.amountMinor ?? leg.amount_minor);
    const accountRef = leg.accountRef ?? leg.account_ref;
    const legCurrency = leg.currency ?? currency;

    const res = await tx.query(
      `INSERT INTO transaction_legs (
         intent_id, leg_type, amount_minor, currency, account_ref, status, external_ref
       ) VALUES ($1, $2, $3, $4, $5, 'POSTED', $6)
       RETURNING leg_id, intent_id, leg_type, amount_minor, currency, account_ref, status, external_ref`,
      [intentId, legType, amountMinor.toString(), legCurrency, accountRef, externalRef],
    );
    insertedLegs.push(res.rows[0]);
  }

  // Compute canonical lines hash
  const linesHash = computeLegsHash(insertedLegs);

  // Append entry to signed hash-chained evidence ledger
  const ledgerEntry = await appendEntry(tx, {
    orgId,
    type: LEDGER_TYPES.LEGS_POSTED,
    subjectType: 'transaction_intent',
    subjectId: intentId,
    payload: {
      rule_id: ruleId,
      step,
      lines_hash: linesHash,
      leg_count: insertedLegs.length,
      request_id: intentId,
    },
  });

  return {
    posted: true,
    idempotent: false,
    legs: insertedLegs,
    linesHash,
    ledgerSeq: ledgerEntry.seq,
    ledgerEntryId: `${orgId}:${ledgerEntry.seq}`,
  };
}

export async function reverse(tx, intentId, reason = 'CORRECTION') {
  // Query original legs
  const original = await tx.query(
    `SELECT leg_id, intent_id, leg_type, amount_minor, currency, account_ref
     FROM transaction_legs
     WHERE intent_id = $1`,
    [intentId],
  );

  if (original.rows.length === 0) {
    throw new Error(`No original transaction legs found to reverse for intent ${intentId}.`);
  }

  const intentRes = await tx.query(
    `SELECT org_id FROM transaction_intents WHERE intent_id = $1`,
    [intentId],
  );
  const orgId = intentRes.rows[0]?.org_id;

  const reversingLegs = [];
  const externalRef = `reverse:${Date.now()}`;

  for (const row of original.rows) {
    const invertedType = row.leg_type === 'DEBIT' ? 'CREDIT' : 'DEBIT';
    const res = await tx.query(
      `INSERT INTO transaction_legs (
         intent_id, leg_type, amount_minor, currency, account_ref, status, external_ref
       ) VALUES ($1, $2, $3, $4, $5, 'POSTED', $6)
       RETURNING leg_id, intent_id, leg_type, amount_minor, currency, account_ref, status`,
      [intentId, invertedType, row.amount_minor, row.currency, row.account_ref, externalRef],
    );
    reversingLegs.push(res.rows[0]);
  }

  const linesHash = computeLegsHash(reversingLegs);

  if (orgId) {
    await appendEntry(tx, {
      orgId,
      type: LEDGER_TYPES.LEGS_POSTED,
      subjectType: 'transaction_intent',
      subjectId: intentId,
      payload: {
        action: 'REVERSAL',
        reason,
        lines_hash: linesHash,
        reversed_leg_count: reversingLegs.length,
      },
    });
  }

  return {
    reversed: true,
    legs: reversingLegs,
    linesHash,
  };
}

export async function verifyJournal(orgId) {
  // 1. Calculate trial balance per currency
  const res = await query(
    `SELECT l.currency,
            COALESCE(SUM(CASE WHEN l.leg_type = 'DEBIT' THEN l.amount_minor ELSE 0 END), 0) AS total_debit,
            COALESCE(SUM(CASE WHEN l.leg_type = 'CREDIT' THEN l.amount_minor ELSE 0 END), 0) AS total_credit
     FROM transaction_legs l
     JOIN transaction_intents i ON l.intent_id = i.intent_id
     WHERE i.org_id = $1
     GROUP BY l.currency`,
    [orgId],
  );

  let balanced = true;
  const balanceByCurrency = {};

  for (const row of res.rows) {
    const d = BigInt(row.total_debit);
    const c = BigInt(row.total_credit);
    balanceByCurrency[row.currency] = {
      debit: d.toString(),
      credit: c.toString(),
      balanced: d === c,
    };
    if (d !== c) {
      balanced = false;
    }
  }

  return {
    verified: balanced,
    balanceByCurrency,
  };
}

export default {
  ensureAccounts,
  post,
  reverse,
  verifyJournal,
};
