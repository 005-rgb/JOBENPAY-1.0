/**
 * server/src/services/sar.js
 * Structured Audit Record (SAR v1.1) Generator & Verifier (PRD 1.3 §0 Aturan Emas #4, AD-02, Blueprint M9)
 * Supported categories: PAYOUT, SALE, REFUND, VOID, PARTIAL, DOWN_PAYMENT, INVOICE, DISPUTE, SCHEDULED, BULK, TRANSFER, SPLIT, RECURRING, FINANCING, DEBIT.
 */

import crypto from 'node:crypto';
import { canonicalJson } from '../../../shared/canonical.js';

export const SAR_VERSION = '1.1';

export function computeSarHash(sarPayload) {
  const canonical = canonicalJson(sarPayload);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function generateSar({
  intent,
  legs = [],
  executions = [],
  mandateVersion = null,
  actor = null,
}) {
  const intentId = intent.intent_id ?? intent.id;
  const category = intent.category ?? 'PAYOUT';
  const subType = intent.sub_type ?? intent.subType ?? 'standard';
  const amountMinorStr = String(intent.amount_minor ?? intent.amountMinor);
  const currency = intent.currency;

  let totalDebit = 0n;
  let totalCredit = 0n;
  const accounts = new Set();

  for (const leg of legs) {
    const amt = BigInt(leg.amount_minor ?? leg.amountMinor);
    if (leg.leg_type === 'DEBIT' || leg.legType === 'DEBIT') {
      totalDebit += amt;
    } else if (leg.leg_type === 'CREDIT' || leg.legType === 'CREDIT') {
      totalCredit += amt;
    }
    accounts.add(leg.account_ref ?? leg.accountRef);
  }

  const latestExec = executions[executions.length - 1] ?? null;
  const refs = latestExec?.provider_refs ?? latestExec?.providerRefs ?? {};

  const sarPayload = {
    sar_version: SAR_VERSION,
    intent_id: intentId,
    org_id: intent.org_id,
    category,
    sub_type: subType,
    status: intent.status,
    amount_minor: amountMinorStr,
    currency,
    legs_summary: {
      total_debit: totalDebit.toString(),
      total_credit: totalCredit.toString(),
      balanced: totalDebit === totalCredit,
      accounts: Array.from(accounts).sort(),
    },
    paypal_refs: {
      payout_batch_id: refs.payoutBatchId ?? refs.batchId ?? null,
      payout_item_id: refs.payoutItemId ?? refs.itemId ?? null,
      order_id: refs.orderId ?? null,
      authorization_id: refs.authorizationId ?? null,
      capture_id: refs.captureId ?? null,
      refund_id: refs.refundId ?? null,
      invoice_id: refs.invoiceId ?? refs.invoice_id ?? null,
      dispute_id: refs.disputeId ?? refs.dispute_id ?? null,
    },
    mandate_version_id: intent.mandate_version_id ?? mandateVersion?.id ?? null,
    request_hash: intent.request_hash,
    created_at: intent.created_at ? new Date(intent.created_at).toISOString() : new Date().toISOString(),
    actor: actor ? { kind: actor.kind, id: actor.id } : null,
  };

  const sarHash = computeSarHash(sarPayload);
  return {
    ...sarPayload,
    sar_hash: sarHash,
  };
}

export function verifySar(sar) {
  if (!sar || typeof sar !== 'object') {
    return { valid: false, reason: 'SAR must be an object' };
  }
  if (sar.sar_version !== SAR_VERSION) {
    return { valid: false, reason: `Invalid SAR version: expected ${SAR_VERSION}, got ${sar.sar_version}` };
  }
  if (!sar.legs_summary || typeof sar.legs_summary !== 'object') {
    return { valid: false, reason: 'Missing legs_summary' };
  }
  if (sar.legs_summary.total_debit !== sar.legs_summary.total_credit) {
    return { valid: false, reason: `Unbalanced legs: debit=${sar.legs_summary.total_debit}, credit=${sar.legs_summary.total_credit}` };
  }

  const { sar_hash: existingHash, ...payload } = sar;
  const expectedHash = computeSarHash(payload);
  if (existingHash !== expectedHash) {
    return { valid: false, reason: 'SAR hash mismatch: record has been tampered with' };
  }

  return { valid: true };
}

export default {
  SAR_VERSION,
  generateSar,
  verifySar,
  computeSarHash,
};

