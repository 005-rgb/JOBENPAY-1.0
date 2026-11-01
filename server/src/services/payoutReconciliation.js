import crypto from 'node:crypto';

import { env } from '../config.js';
import { hmacSha256 } from '../lib/crypto.js';
import { notifyOrgRoles } from '../repositories/notifications.js';
import { getExecutionRequest, saveExecutionResult } from '../repositories/executions.js';
import { transition } from './requestStateMachine.js';

const SUCCESS_STATUSES = new Set(['SUCCESS', 'SUCCEEDED']);
const REVIEW_STATUSES = new Set([
  'FAILED', 'DENIED', 'RETURNED', 'UNCLAIMED', 'ONHOLD', 'BLOCKED', 'REFUNDED', 'CANCELED', 'CANCELLED',
]);

function normalizeMinorAmount(value) {
  const match = String(value ?? '').match(/^([0-9]+)(?:\.([0-9]{1,2}))?$/);
  if (!match) return null;
  return (BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0') || 0)).toString();
}

function timingSafeHexEqual(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(left || '') || !/^[a-f0-9]{64}$/i.test(right || '')) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function extractPayoutItem(resource = {}) {
  const item = resource.payout_item ?? resource;
  return {
    senderItemId: item.sender_item_id ?? item.payout_item?.sender_item_id ?? null,
    senderBatchId: item.sender_batch_id
      ?? resource.sender_batch_id
      ?? resource.sender_batch_header?.sender_batch_id
      ?? resource.payout_batch_header?.sender_batch_id
      ?? null,
    payoutBatchId: item.payout_batch_id ?? resource.payout_batch_id ?? resource.batch_header?.payout_batch_id ?? null,
    receiver: item.receiver ?? item.payout_item?.receiver ?? null,
    amount: item.amount ?? item.payout_item?.amount ?? null,
    status: item.transaction_status
      ?? item.payout_item_status
      ?? item.payout_item?.transaction_status
      ?? resource.batch_header?.batch_status
      ?? resource.batch_status
      ?? null,
  };
}

export function classifyPayoutResult({ request, payoutItem, eventType = '' }) {
  const status = String(payoutItem.status ?? '').toUpperCase();
  if (REVIEW_STATUSES.has(status)) return { kind: 'REVIEW', status };
  const isSuccessful = SUCCESS_STATUSES.has(status)
    || /\.(SUCCEEDED|SUCCESS)$/.test(eventType);
  if (!isSuccessful) return { kind: 'PENDING', status };

  const amount = normalizeMinorAmount(payoutItem.amount?.value);
  const currency = String(payoutItem.amount?.currency ?? '').trim().toUpperCase();
  const receiverHmac = payoutItem.receiver && env.JOBENPAY_HMAC_PEPPER
    ? hmacSha256(env.JOBENPAY_HMAC_PEPPER, String(payoutItem.receiver).trim().toLowerCase())
    : null;
  const isMismatch = (payoutItem.senderItemId && payoutItem.senderItemId !== request.id)
    || (payoutItem.senderBatchId && payoutItem.senderBatchId !== `jp_${request.id}`)
    || amount === null
    || amount !== BigInt(request.amount_minor).toString()
    || !currency
    || currency !== request.currency.trim()
    || !receiverHmac
    || !timingSafeHexEqual(receiverHmac, request.identifier_hmac);
  return isMismatch ? { kind: 'MISMATCH', status } : { kind: 'RECONCILED', status };
}

export async function applyPayoutResult(tx, {
  orgId,
  requestId,
  executionId,
  payoutItem,
  eventType,
  source,
}) {
  const request = await getExecutionRequest(orgId, requestId, tx, { forUpdate: true });
  if (!request) return { kind: 'UNKNOWN' };
  if (request.status !== 'EXECUTED') return { kind: 'WAIT_FOR_EXECUTION' };

  const result = classifyPayoutResult({ request, payoutItem, eventType });
  if (result.kind === 'PENDING') return result;
  if (result.kind === 'REVIEW') {
    await saveExecutionResult(tx, {
      orgId,
      executionId,
      status: 'SUCCEEDED',
      responseRedacted: { providerStatus: result.status, source },
    });
    await notifyOrgRoles(tx, orgId, ['OWNER', 'ADMIN', 'APPROVER'], 'PAYOUT_REQUIRES_REVIEW', {
      requestId,
      providerStatus: result.status,
    });
    return result;
  }

  const to = result.kind === 'MISMATCH' ? 'MISMATCH' : 'RECONCILED';
  await saveExecutionResult(tx, {
    orgId,
    executionId,
    status: 'SUCCEEDED',
    responseRedacted: { providerStatus: result.status, source },
  });
  await transition(tx, request, to, { kind: 'SYSTEM', id: `payout-${source}` }, {
    reasonCodes: result.kind === 'MISMATCH' ? ['PAYOUT_MISMATCH'] : [],
    explanation: result.kind === 'MISMATCH'
      ? 'PayPal payout details did not match the approved request.'
      : 'PayPal confirmed the payout details.',
    ledgerPayload: {
      providerStatus: result.status,
      ...(result.kind === 'MISMATCH' ? { reasonCode: 'PAYOUT_MISMATCH' } : {}),
    },
  });
  return result;
}

export function payoutBatchResponse(batch) {
  const batchHeader = batch?.batch_header ?? {};
  const items = Array.isArray(batch?.items) ? batch.items : [];
  return {
    payoutBatchId: batchHeader.payout_batch_id ?? null,
    batchStatus: String(batchHeader.batch_status ?? '').toUpperCase(),
    items: items.map((entry) => extractPayoutItem({
      ...entry,
      payout_item: entry.payout_item ?? entry,
      payout_batch_id: batchHeader.payout_batch_id,
      batch_header: batchHeader,
    })),
  };
}

export function safeBatchResponse(batch) {
  const normalized = payoutBatchResponse(batch);
  return {
    payoutBatchId: normalized.payoutBatchId,
    batchStatus: normalized.batchStatus,
    itemCount: normalized.items.length,
  };
}
