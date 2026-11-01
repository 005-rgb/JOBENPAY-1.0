import { withTx } from '../db/tx.js';
import { paypalFor as defaultPaypalFor } from '../paypal/client.js';
import {
  getExecution,
  getExecutionRequest,
  findExecutionRequestForWebhook,
} from '../repositories/executions.js';
import {
  getVerifiedWebhookEvent,
  lockVerifiedWebhookEvent,
  markWebhookProcessed,
} from '../repositories/webhookEvents.js';
import { notifyOrgRoles } from '../repositories/notifications.js';
import {
  applyPayoutResult,
  extractPayoutItem,
  payoutBatchResponse,
} from '../services/payoutReconciliation.js';

function isPayoutEvent(eventType) {
  return /^PAYMENT\.PAYOUTSBATCH\./.test(eventType)
    || /^PAYMENT\.PAYOUTS-ITEM\./.test(eventType);
}

async function markProcessed(db, orgId, eventId, status = 'PROCESSED') {
  await withTx(async (tx) => markWebhookProcessed(tx, orgId, eventId, status), db);
}

async function retryOrEscalate(job, db, orgId, eventId, message) {
  if ((Number(job.attempts) || 1) >= 5) {
    await withTx(async (tx) => {
      const event = await lockVerifiedWebhookEvent(tx, orgId, eventId);
      if (!event || event.processed_at) return;
      const requestId = String(event.payload?.resource?.sender_item_id ?? '');
      await notifyOrgRoles(tx, orgId, ['OWNER', 'ADMIN', 'APPROVER'], 'PAYOUT_REQUIRES_REVIEW', {
        requestId: requestId || null,
        reasonCode: 'WEBHOOK_EXECUTION_NOT_READY',
        urgent: true,
      });
      await markWebhookProcessed(tx, orgId, eventId, 'NEEDS_REVIEW');
    }, db);
    return;
  }
  const error = new Error(message);
  error.code = 'WEBHOOK_WAITING_FOR_EXECUTION';
  throw error;
}

export async function processWebhook(job, { db, paypalFor = defaultPaypalFor } = {}) {
  const orgId = job.payload?.orgId;
  const eventId = job.payload?.eventId;
  if (!orgId || !eventId) throw new TypeError('process_webhook requires orgId and eventId.');

  const webhook = await getVerifiedWebhookEvent(orgId, eventId, db);
  if (!webhook || webhook.processed_at) return;
  const event = webhook.payload;
  if (!isPayoutEvent(webhook.event_type)) {
    await markProcessed(db, orgId, eventId, 'IGNORED');
    return;
  }

  const resource = event?.resource ?? {};
  const eventItem = extractPayoutItem(resource);
  const request = await findExecutionRequestForWebhook(orgId, eventItem, db);
  if (!request) {
    await markProcessed(db, orgId, eventId, 'IGNORED');
    return;
  }
  if (['RECONCILED', 'MISMATCH', 'FAILED', 'CANCELLED'].includes(request.status)) {
    await markProcessed(db, orgId, eventId, 'IGNORED');
    return;
  }
  if (request.status !== 'EXECUTED' || request.execution_status !== 'SUCCEEDED') {
    await retryOrEscalate(job, db, orgId, eventId, 'Payout webhook arrived before execution was committed.');
    return;
  }

  let payoutItem = eventItem;
  if (!payoutItem.receiver || !payoutItem.amount) {
    if (!request.paypal_ref) {
      await retryOrEscalate(job, db, orgId, eventId, 'Payout batch details are not yet available.');
      return;
    }
    let response;
    try {
      const paypal = await paypalFor(orgId, { db });
      response = await paypal.request(
        'GET',
        `/v1/payments/payouts/${encodeURIComponent(request.paypal_ref)}?page=1&page_size=100`,
      );
    } catch (error) {
      if ((Number(job.attempts) || 1) >= 5) {
        await retryOrEscalate(job, db, orgId, eventId, 'Payout details could not be fetched for webhook validation.');
        return;
      }
      const safe = new Error('Payout details could not be fetched for webhook validation.');
      safe.code = error?.code || 'PAYPAL_UNAVAILABLE';
      safe.statusCode = error?.statusCode || 503;
      throw safe;
    }
    const batch = payoutBatchResponse(response);
    payoutItem = batch.items.find((item) => item.senderItemId === request.id)
      ?? batch.items[0]
      ?? { ...eventItem, status: eventItem.status || batch.batchStatus };
  }

  const outcome = await withTx(async (tx) => {
    const lockedWebhook = await lockVerifiedWebhookEvent(tx, orgId, eventId);
    if (!lockedWebhook || lockedWebhook.processed_at) return;
    const currentRequest = await getExecutionRequest(orgId, request.id, tx, { forUpdate: true });
    const currentExecution = await getExecution(orgId, request.id, tx, { forUpdate: true });
    if (!currentRequest || currentRequest.status !== 'EXECUTED'
      || currentExecution?.status !== 'SUCCEEDED') {
      return { waiting: true };
    }
    const result = await applyPayoutResult(tx, {
      orgId,
      requestId: request.id,
      executionId: currentExecution.id,
      payoutItem,
      eventType: webhook.event_type,
      source: 'webhook',
    });
    if (result.kind === 'PENDING') {
      return { waiting: true };
    }
    await markWebhookProcessed(tx, orgId, eventId, result.kind);
    return { waiting: false };
  }, db);
  if (outcome?.waiting) {
    await retryOrEscalate(job, db, orgId, eventId, 'Payout webhook does not report a final item status.');
  }
}
