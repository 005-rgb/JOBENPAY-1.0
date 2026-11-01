import { env } from '../../config.js';
import { decrypt } from '../../lib/crypto.js';
import { withTx } from '../../db/tx.js';
import { formatMinor } from '../../db/money.js';
import { assertNotFrozen } from '../../services/freeze.js';
import { requestHash } from '../../services/requestHash.js';
import { transition } from '../../services/requestStateMachine.js';
import { enqueue } from '../queue.js';
import { paypalFor as defaultPaypalFor } from '../../paypal/client.js';
import {
  getExecution,
  getExecutionRequest,
  markExecutionSent,
  saveExecutionResult,
  startExecution,
} from '../../repositories/executions.js';
import { notifyOrgRoles } from '../../repositories/notifications.js';

const MAX_PAYOUT_ATTEMPTS = 5;

function actor() {
  return { kind: 'SYSTEM', id: 'execute-request' };
}

function batchId(requestId) {
  return `jp_${requestId}`;
}

function safeResponse(response) {
  const header = response?.batch_header ?? null;
  return {
    batchId: header?.payout_batch_id ?? null,
    batchStatus: header?.batch_status ?? null,
    senderBatchId: header?.sender_batch_header?.sender_batch_id ?? null,
  };
}

function safeProviderError(error) {
  const safe = new Error('PayPal payout request did not complete.');
  safe.code = error?.code || 'PAYPAL_NETWORK_ERROR';
  safe.statusCode = error?.statusCode || 503;
  return safe;
}

function isRetryable(error) {
  return error?.statusCode === 429
    || error?.statusCode >= 500
    || ['PAYPAL_NETWORK_ERROR', 'PAYPAL_UNAVAILABLE', 'PAYPAL_RATE_LIMITED'].includes(error?.code);
}

function originalBatchId(error) {
  const providerResponse = error?.details?.response;
  if (!/duplicate[_ ](?:batch|request)|duplicate_batch_id/i.test(JSON.stringify(providerResponse ?? {}))) {
    return null;
  }
  for (const link of providerResponse?.links ?? []) {
    if (typeof link.href !== 'string') continue;
    try {
      const match = new URL(link.href).pathname.match(/\/v1\/payments\/payouts\/([^/]+)$/);
      if (match) return decodeURIComponent(match[1]);
    } catch {
      continue;
    }
  }
  return null;
}

async function failExecution(db, orgId, requestId, executionId, reasonCode, {
  preserveReservation = false,
  httpStatus = null,
} = {}) {
  return withTx(async (tx) => {
    const request = await getExecutionRequest(orgId, requestId, tx, { forUpdate: true });
    if (!request || request.status !== 'EXECUTING') return;

    await saveExecutionResult(tx, {
      orgId,
      executionId,
      status: 'FAILED',
      httpStatus,
      responseRedacted: { reasonCode },
    });
    await transition(tx, request, 'FAILED', actor(), {
      reasonCodes: [reasonCode],
      explanation: reasonCode === 'UNCERTAIN_NEEDS_MANUAL_CHECK'
        ? 'Payout status could not be confirmed. Manual review is required.'
        : 'The sandbox payout request was rejected.',
      preserveReservation,
      ledgerPayload: { reasonCode, reservationPreserved: preserveReservation },
    });
    if (preserveReservation) {
      await notifyOrgRoles(tx, orgId, ['OWNER', 'ADMIN', 'APPROVER'], 'UNCERTAIN_NEEDS_MANUAL_CHECK', {
        requestId,
        reasonCode,
        urgent: true,
      });
    }
  }, db);
}

async function guardAndMarkSent(db, orgId, requestId, executionId) {
  return withTx(async (tx) => {
    const request = await getExecutionRequest(orgId, requestId, tx, { forUpdate: true });
    if (!request || request.status !== 'EXECUTING') return null;
    try {
      await assertNotFrozen(tx, orgId);
    } catch (error) {
      if (error.code !== 'ORG_FROZEN') throw error;
      const execution = await getExecution(orgId, requestId, tx, { forUpdate: true });
      if (!execution) return null;
      const uncertain = execution.status === 'SENT' || Number(execution.attempts) > 0;
      const reasonCode = uncertain ? 'UNCERTAIN_NEEDS_MANUAL_CHECK' : 'ORG_FROZEN';
      await saveExecutionResult(tx, {
        orgId,
        executionId: execution.id,
        status: 'FAILED',
        responseRedacted: { reasonCode },
      });
      await transition(tx, request, 'FAILED', actor(), {
        reasonCodes: [reasonCode],
        explanation: uncertain
          ? 'Payout status could not be confirmed after the organization was frozen.'
          : 'The organization was frozen before the payout was sent.',
        preserveReservation: uncertain,
        ledgerPayload: { reasonCode, reservationPreserved: uncertain },
      });
      if (uncertain) {
        await notifyOrgRoles(tx, orgId, ['OWNER', 'ADMIN', 'APPROVER'], 'UNCERTAIN_NEEDS_MANUAL_CHECK', {
          requestId,
          reasonCode,
          urgent: true,
        });
      }
      return null;
    }
    return markExecutionSent(tx, { orgId, executionId });
  }, db);
}

async function prepare(db, orgId, requestId) {
  return withTx(async (tx) => {
    const request = await getExecutionRequest(orgId, requestId, tx, { forUpdate: true });
    if (!request) return { done: true };

    let execution = null;
    if (request.status === 'EXECUTING') {
      execution = await startExecution(tx, { orgId, requestId });
      if (!execution || !['STARTED', 'SENT'].includes(execution.status)) return { done: true };
    } else if (request.status !== 'APPROVED') {
      return { done: true };
    } else {
      try {
        await assertNotFrozen(tx, orgId);
      } catch (error) {
        if (error.code !== 'ORG_FROZEN') throw error;
        await transition(tx, request, 'CANCELLED', actor(), {
          reasonCodes: ['ORG_FROZEN'],
          explanation: 'The organization is frozen; the payout was cancelled.',
          ledgerPayload: { reasonCode: 'ORG_FROZEN' },
        });
        return { done: true };
      }

      const currentHash = requestHash({
        orgId: request.org_id,
        agentId: request.agent_id,
        mandateVersionId: request.mandate_version_id,
        action: request.action,
        amountMinor: request.amount_minor,
        currency: request.currency,
        payeeId: request.payee_id,
        documentSha256: request.document_sha256 ?? null,
      });
      if (currentHash !== request.request_hash) {
        const executing = await transition(tx, request, 'EXECUTING', actor(), {
          ledgerPayload: { requestHash: request.request_hash },
        });
        await transition(tx, executing, 'FAILED', actor(), {
          reasonCodes: ['HASH_CHANGED'],
          explanation: 'The approved request changed before payout execution.',
          ledgerPayload: { reasonCode: 'HASH_CHANGED' },
        });
        return { done: true };
      }

      await transition(tx, request, 'EXECUTING', actor(), {
        ledgerPayload: { requestHash: request.request_hash },
      });
      execution = await startExecution(tx, { orgId, requestId });
    }

    return { done: false, request, execution };
  }, db);
}

async function recordSuccess(db, orgId, requestId, execution, response, httpStatus) {
  const redacted = safeResponse(response);
  if (!redacted.batchId) {
    const error = new Error('PayPal payout response did not contain a batch ID.');
    error.code = 'PAYPAL_INVALID_PAYOUT_RESPONSE';
    error.statusCode = 503;
    throw error;
  }

  await withTx(async (tx) => {
    const current = await getExecutionRequest(orgId, requestId, tx, { forUpdate: true });
    const storedExecution = await startExecution(tx, { orgId, requestId });
    if (!current || current.status !== 'EXECUTING' || !storedExecution) return;
    await saveExecutionResult(tx, {
      orgId,
      executionId: storedExecution.id,
      status: 'SUCCEEDED',
      paypalRef: redacted.batchId,
      httpStatus,
      responseRedacted: redacted,
    });
    await transition(tx, current, 'EXECUTED', actor(), {
      ledgerPayload: {
        payoutBatchId: redacted.batchId,
        httpStatus,
      },
    });
    await enqueue(tx, {
      type: 'reconcile_request',
      orgId,
      payload: { orgId, requestId, pollAttempt: 0 },
      runAt: new Date(Date.now() + 3 * 60 * 1000),
      dedupeKey: `rec:${requestId}`,
    });
  }, db);
}

export async function executeRequest(job, {
  db,
  paypalFor = defaultPaypalFor,
  encryptionKey = env.JOBENPAY_ENC_KEY,
} = {}) {
  const orgId = job.payload?.orgId;
  const requestId = job.payload?.requestId;
  if (!orgId || !requestId) throw new TypeError('execute_request requires orgId and requestId.');

  const prepared = await prepare(db, orgId, requestId);
  if (prepared.done) return;
  const { request, execution } = prepared;

  const attempt = Number(job.attempts) || Number(execution.attempts) + 1;
  if (attempt > MAX_PAYOUT_ATTEMPTS || Number(execution.attempts) >= MAX_PAYOUT_ATTEMPTS) {
    await failExecution(db, orgId, requestId, execution.id, 'UNCERTAIN_NEEDS_MANUAL_CHECK', {
      preserveReservation: true,
    });
    const error = new Error('Payout status could not be confirmed after the retry limit.');
    error.code = 'UNCERTAIN_NEEDS_MANUAL_CHECK';
    throw error;
  }

  let paypal;
  try {
    paypal = await paypalFor(orgId, { db });
  } catch (error) {
    if (attempt >= MAX_PAYOUT_ATTEMPTS) {
      await failExecution(
        db,
        orgId,
        requestId,
        execution.id,
        execution.status === 'SENT' ? 'UNCERTAIN_NEEDS_MANUAL_CHECK' : error.code || 'PAYPAL_UNAVAILABLE',
        { preserveReservation: execution.status === 'SENT' },
      );
      if (execution.status === 'SENT') {
        const uncertain = new Error('Payout status could not be confirmed after the retry limit.');
        uncertain.code = 'UNCERTAIN_NEEDS_MANUAL_CHECK';
        throw uncertain;
      }
      return;
    }
    throw safeProviderError(error);
  }
  if (execution.paypal_ref) {
    let existing;
    try {
      existing = await paypal.request(
        'GET',
        `/v1/payments/payouts/${encodeURIComponent(execution.paypal_ref)}?page=1&page_size=100`,
        { includeStatus: true },
      );
    } catch (error) {
      if (error?.details?.status !== 404) {
        if (attempt >= MAX_PAYOUT_ATTEMPTS) {
          await failExecution(db, orgId, requestId, execution.id, 'UNCERTAIN_NEEDS_MANUAL_CHECK', {
            preserveReservation: true,
          });
          const uncertain = new Error('Payout status could not be confirmed after the retry limit.');
          uncertain.code = 'UNCERTAIN_NEEDS_MANUAL_CHECK';
          throw uncertain;
        }
        throw safeProviderError(error);
      }
    }
    if (existing) {
      await recordSuccess(db, orgId, requestId, execution, existing.body, existing.status);
      return;
    }
  }

  if (!request.identifier_enc || !request.payee_kind) {
    await failExecution(db, orgId, requestId, execution.id, 'PAYEE_UNAVAILABLE');
    return;
  }
  if (!encryptionKey) {
    await failExecution(db, orgId, requestId, execution.id, 'PAYPAL_ENCRYPTION_KEY_MISSING');
    return;
  }
  let receiver;
  try {
    receiver = decrypt({
      key: encryptionKey,
      payload: request.identifier_enc,
      aad: `payees:identifier_enc:${orgId}`,
    });
  } catch {
    await failExecution(db, orgId, requestId, execution.id, 'PAYEE_DECRYPT_FAILED');
    return;
  }
  const sent = await guardAndMarkSent(db, orgId, requestId, execution.id);
  if (!sent) return;
  const payload = {
    sender_batch_header: { sender_batch_id: batchId(requestId) },
    items: [{
      recipient_type: request.payee_kind,
      receiver,
      amount: {
        value: formatMinor(request.amount_minor),
        currency: request.currency.trim(),
      },
      note: 'Authorized JOBENPAY sandbox payout',
      sender_item_id: requestId,
    }],
  };

  let response;
  try {
    response = await paypal.request('POST', '/v1/payments/payouts', {
      body: payload,
      idempotencyId: requestId,
      retryable: false,
      includeStatus: true,
    });
  } catch (error) {
    const existingBatchId = originalBatchId(error);
    if (existingBatchId) {
      try {
        response = await paypal.request(
          'GET',
          `/v1/payments/payouts/${encodeURIComponent(existingBatchId)}?page=1&page_size=100`,
          { includeStatus: true },
        );
      } catch {
        if (attempt >= MAX_PAYOUT_ATTEMPTS || sent.attempts >= MAX_PAYOUT_ATTEMPTS) {
          await failExecution(db, orgId, requestId, execution.id, 'UNCERTAIN_NEEDS_MANUAL_CHECK', {
            preserveReservation: true,
          });
          const uncertain = new Error('Payout status could not be confirmed after the retry limit.');
          uncertain.code = 'UNCERTAIN_NEEDS_MANUAL_CHECK';
          throw uncertain;
        }
        const unavailable = new Error('PayPal payout status could not be confirmed.');
        unavailable.code = 'PAYPAL_UNAVAILABLE';
        unavailable.statusCode = 503;
        throw unavailable;
      }
    } else {
      if (!isRetryable(error)) {
        await failExecution(db, orgId, requestId, execution.id, error.code || 'PAYPAL_REQUEST_REJECTED', {
          httpStatus: error.statusCode ?? null,
        });
        return;
      }
      if (attempt >= MAX_PAYOUT_ATTEMPTS || sent.attempts >= MAX_PAYOUT_ATTEMPTS) {
        const uncertain = error.statusCode !== 429;
        const reasonCode = uncertain ? 'UNCERTAIN_NEEDS_MANUAL_CHECK' : 'PAYPAL_RATE_LIMITED';
        await failExecution(db, orgId, requestId, execution.id, reasonCode, {
          preserveReservation: uncertain,
          httpStatus: error.statusCode ?? null,
        });
        throw safeProviderError(error);
      }
      throw safeProviderError(error);
    }
  }
  await recordSuccess(db, orgId, requestId, execution, response.body, response.status);
}
