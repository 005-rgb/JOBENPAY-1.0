import { withTx } from '../../db/tx.js';
import { enqueue } from '../queue.js';
import { getExecution, getExecutionRequest, saveExecutionResult } from '../../repositories/executions.js';
import { notifyOrgRoles } from '../../repositories/notifications.js';
import { paypalFor as defaultPaypalFor } from '../../paypal/client.js';
import { applyPayoutResult, payoutBatchResponse, safeBatchResponse } from '../../services/payoutReconciliation.js';

const MAX_POLL_ATTEMPTS = 10;

function retryDelayMs(attempt) {
  return Math.min(60 * 60 * 1000, 3 * 60 * 1000 * (attempt + 1));
}

async function scheduleNext(db, orgId, requestId, pollAttempt) {
  if (pollAttempt + 1 >= MAX_POLL_ATTEMPTS) {
    await withTx(async (tx) => {
      const current = await getExecutionRequest(orgId, requestId, tx, { forUpdate: true });
      if (!current || current.status !== 'EXECUTED') return;
      await notifyOrgRoles(tx, orgId, ['OWNER', 'ADMIN', 'APPROVER'], 'PAYOUT_REQUIRES_REVIEW', {
        requestId,
        reasonCode: 'RECONCILIATION_LIMIT_REACHED',
        urgent: true,
      });
    }, db);
    return;
  }
  await enqueue(db, {
    type: 'reconcile_request',
    orgId,
    payload: { orgId, requestId, pollAttempt: pollAttempt + 1 },
    runAt: new Date(Date.now() + retryDelayMs(pollAttempt)),
    dedupeKey: `rec:${requestId}:${pollAttempt + 1}`,
  });
}

export async function reconcileRequest(job, { db, paypalFor = defaultPaypalFor } = {}) {
  const orgId = job.payload?.orgId;
  const requestId = job.payload?.requestId;
  if (!orgId || !requestId) throw new TypeError('reconcile_request requires orgId and requestId.');

  const [request, execution] = await Promise.all([
    getExecutionRequest(orgId, requestId, db),
    getExecution(orgId, requestId, db),
  ]);
  if (!request || request.status !== 'EXECUTED' || !execution?.paypal_ref) return;

  const paypal = await paypalFor(orgId, { db });
  const pollAttempt = Number(job.payload.pollAttempt) || 0;
  let result;
  try {
    result = await paypal.request(
      'GET',
      `/v1/payments/payouts/${encodeURIComponent(execution.paypal_ref)}?page=1&page_size=100`,
      { includeStatus: true },
    );
  } catch {
    await scheduleNext(db, orgId, requestId, pollAttempt);
    return;
  }
  const normalized = payoutBatchResponse(result.body);
  const payoutItem = normalized.items.find((item) => item.senderItemId === requestId)
    ?? normalized.items[0];

  if (payoutItem) {
    const applied = await withTx(async (tx) => {
      const current = await getExecutionRequest(orgId, requestId, tx, { forUpdate: true });
      if (!current || current.status !== 'EXECUTED') return { kind: 'DONE' };
      const stored = await getExecution(orgId, requestId, tx, { forUpdate: true });
      if (!stored) return { kind: 'DONE' };
      const applied = await applyPayoutResult(tx, {
        orgId,
        requestId,
        executionId: stored.id,
        payoutItem: { ...payoutItem, status: payoutItem.status || normalized.batchStatus },
        eventType: '',
        source: 'poll',
      });
      if (applied.kind === 'REVIEW' || applied.kind === 'PENDING') {
        await saveExecutionResult(tx, {
          orgId,
          executionId: stored.id,
          status: 'SUCCEEDED',
          httpStatus: result.status,
          responseRedacted: safeBatchResponse(result.body),
        });
      }
      return applied;
    }, db);
    if (applied.kind !== 'PENDING') return;
  }

  await scheduleNext(db, orgId, requestId, pollAttempt);
}
