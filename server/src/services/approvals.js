import { AppError } from '../lib/errors.js';
import { withTx } from '../db/tx.js';
import { enqueue } from '../jobs/queue.js';
import { notifyOrgRoles } from '../repositories/notifications.js';
import { consumeGrant } from '../repositories/stepUp.js';
import { requestHash } from './requestHash.js';
import { transition } from './requestStateMachine.js';
import { appendEntry, LEDGER_TYPES } from './ledger.js';

function approvalError(code, message, statusCode = 409) {
  const error = new AppError(code, message);
  error.statusCode = statusCode;
  return error;
}

function requireId(value, label) {
  if (!value) {
    const error = new AppError('VALIDATION_FAILED', `${label} is required.`);
    error.statusCode = 400;
    throw error;
  }
}

function hashForRequest(request, documentSha256) {
  return requestHash({
    orgId: request.org_id,
    agentId: request.agent_id,
    mandateVersionId: request.mandate_version_id,
    action: request.action,
    amountMinor: request.amount_minor,
    currency: request.currency,
    payeeId: request.payee_id,
    documentSha256,
  });
}

export function requiresFourEyes(amountMinor, thresholdMinor) {
  return thresholdMinor != null && BigInt(amountMinor) > BigInt(thresholdMinor);
}

async function updateApprovalStatus(tx, orgId, approvalId, status) {
  await tx.query(
    'UPDATE approvals SET status = $3 WHERE org_id = $1 AND id = $2 AND status = $4',
    [orgId, approvalId, status, 'PENDING'],
  );
}

async function recordDecision(tx, {
  orgId,
  approvalId,
  userId,
  decision,
  comment,
  stepUpGrantId,
}) {
  await tx.query(
    `INSERT INTO approval_decisions (org_id, approval_id, decided_by, decision, comment, step_up_grant_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [orgId, approvalId, userId, decision, comment, stepUpGrantId ?? null],
  );
}

async function appendApprovalLedger(tx, request, approval, userId, decision, requestHashValue, extra = {}) {
  await appendEntry(tx, {
    orgId: request.org_id,
    type: LEDGER_TYPES.APPROVAL_DECIDED,
    subjectType: 'PAYMENT_REQUEST',
    subjectId: request.id,
    payload: {
      requestId: request.id,
      approvalId: approval.id,
      decision,
      approverId: userId,
      requestHash: requestHashValue,
      ...extra,
    },
  });
}

export async function decideApproval({
  orgId,
  approvalId,
  userId,
  sessionId,
  requestHash: clientRequestHash,
  decision,
  comment = '',
  stepUpGrantId,
}, { db } = {}) {
  requireId(orgId, 'orgId');
  requireId(userId, 'userId');
  requireId(sessionId, 'sessionId');
  if (!['APPROVE', 'REJECT'].includes(decision)) {
    const error = new AppError('VALIDATION_FAILED', 'decision must be APPROVE or REJECT.');
    error.statusCode = 400;
    throw error;
  }
  if (typeof comment !== 'string' || comment.length > 2000) {
    const error = new AppError('VALIDATION_FAILED', 'comment must be a string of at most 2000 characters.');
    error.statusCode = 400;
    throw error;
  }
  if (!clientRequestHash || !/^[a-f0-9]{64}$/i.test(clientRequestHash)) {
    throw approvalError('REQUEST_HASH_MISMATCH', 'The approval hash does not match the request.', 409);
  }

  const result = await withTx(async (tx) => {
    const approvalResult = await tx.query(
      'SELECT * FROM approvals WHERE org_id = $1 AND id = $2 FOR UPDATE',
      [orgId, approvalId],
    );
    const approval = approvalResult.rows[0];
    if (!approval) throw approvalError('NOT_FOUND', 'Approval not found.', 404);
    if (approval.status !== 'PENDING') {
      throw approvalError('ALREADY_DECIDED', 'This approval has already been decided.', 409);
    }

    const requestResult = await tx.query(
      'SELECT * FROM payment_requests WHERE org_id = $1 AND id = $2 FOR UPDATE',
      [orgId, approval.request_id],
    );
    const request = requestResult.rows[0];
    if (!request) throw approvalError('NOT_FOUND', 'Request not found.', 404);
    if (request.status !== 'PENDING_APPROVAL') {
      throw approvalError('ALREADY_DECIDED', 'This request is no longer pending approval.', 409);
    }
    if (new Date(approval.expires_at).getTime() <= Date.now()) {
      await updateApprovalStatus(tx, orgId, approval.id, 'EXPIRED');
      await transition(tx, request, 'EXPIRED', { kind: 'SYSTEM', id: 'approval-expiry' }, {
        ledgerPayload: { approvalId: approval.id, reasonCode: 'APPROVAL_EXPIRED' },
      });
      await notifyOrgRoles(tx, orgId, ['OWNER', 'ADMIN', 'APPROVER'], 'APPROVAL_EXPIRED', {
        approvalId: approval.id,
        requestId: request.id,
      });
      return { expired: true };
    }

    const document = request.document_id
      ? await tx.query('SELECT sha256 FROM documents WHERE org_id = $1 AND id = $2', [orgId, request.document_id])
      : null;
    if (request.document_id && !document.rowCount) {
      throw approvalError('NOT_FOUND', 'Request document not found.', 404);
    }
    const computedHash = hashForRequest(request, document?.rows[0]?.sha256 ?? null);
    if (computedHash !== approval.request_hash
      || request.request_hash !== approval.request_hash
      || clientRequestHash !== approval.request_hash) {
      throw approvalError('REQUEST_HASH_MISMATCH', 'The request changed after this approval was presented.', 409);
    }

    if (approval.step_up_required) {
      const consumed = await consumeGrant(tx, orgId, {
        grantId: stepUpGrantId,
        userId,
        sessionId,
        purpose: 'APPROVE_ABOVE_THRESHOLD',
      });
      if (!consumed) {
        throw approvalError('STEP_UP_REQUIRED', 'Step-up authentication is required for this approval.', 403);
      }
    }

    const priorDecision = await tx.query(
      `SELECT id FROM approval_decisions
       WHERE org_id = $1 AND approval_id = $2 AND decided_by = $3
       LIMIT 1`,
      [orgId, approval.id, userId],
    );
    if (priorDecision.rowCount) {
      throw approvalError('ALREADY_DECIDED', 'This user has already decided this approval.', 409);
    }
    await recordDecision(tx, {
      orgId,
      approvalId: approval.id,
      userId,
      decision,
      comment: comment.trim() || null,
      stepUpGrantId: approval.step_up_required ? stepUpGrantId : null,
    });

    if (decision === 'REJECT') {
      await updateApprovalStatus(tx, orgId, approval.id, 'REJECTED');
      await transition(tx, request, 'REJECTED', { kind: 'USER', id: userId }, {
        ledgerType: LEDGER_TYPES.APPROVAL_DECIDED,
        ledgerPayload: { approvalId: approval.id, decision, comment: comment.trim() || null },
      });
      return { approvalId: approval.id, requestId: request.id, status: 'REJECTED', decision };
    }

    const policyResult = await tx.query(
      `SELECT policy FROM mandate_versions WHERE org_id = $1 AND id = $2`,
      [orgId, request.mandate_version_id],
    );
    const policy = policyResult.rows[0]?.policy ?? {};
    const fourEyesRequired = requiresFourEyes(request.amount_minor, policy.fourEyesAboveMinor);
    const approvals = await tx.query(
      `SELECT count(DISTINCT decided_by)::integer AS count
       FROM approval_decisions
       WHERE org_id = $1 AND approval_id = $2 AND decision = 'APPROVE'`,
      [orgId, approval.id],
    );
    if (fourEyesRequired && Number(approvals.rows[0].count) < 2) {
      await appendApprovalLedger(tx, request, approval, userId, decision, computedHash, {
        fourEyesRequired: true,
        approvedCount: Number(approvals.rows[0].count),
      });
      return {
        approvalId: approval.id,
        requestId: request.id,
        status: 'PENDING',
        decision,
        approvalsRequired: 2,
        approvalsReceived: Number(approvals.rows[0].count),
      };
    }

    await updateApprovalStatus(tx, orgId, approval.id, 'APPROVED');
    await transition(tx, request, 'APPROVED', { kind: 'USER', id: userId }, {
      ledgerType: LEDGER_TYPES.APPROVAL_DECIDED,
      ledgerPayload: {
        approvalId: approval.id,
        decision,
        comment: comment.trim() || null,
        requestHash: computedHash,
        fourEyesRequired,
        approvalsReceived: Number(approvals.rows[0].count),
      },
    });
    await enqueue(tx, {
      type: 'execute_request',
      orgId,
      payload: { orgId, requestId: request.id },
      dedupeKey: `exec:${request.id}`,
    });
    return { approvalId: approval.id, requestId: request.id, status: 'APPROVED', decision };
  }, db);

  if (result.expired) {
    throw approvalError('APPROVAL_EXPIRED', 'This approval has expired.', 409);
  }
  return result;
}

export async function cancelRequest(orgId, requestId, userId, { db } = {}) {
  const result = await withTx(async (tx) => {
    await tx.query(
      `SELECT id FROM approvals
       WHERE org_id = $1 AND request_id = $2 AND status = 'PENDING'
       FOR UPDATE`,
      [orgId, requestId],
    );
    const locked = await tx.query(
      'SELECT * FROM payment_requests WHERE org_id = $1 AND id = $2 FOR UPDATE',
      [orgId, requestId],
    );
    const request = locked.rows[0];
    if (!request) throw approvalError('NOT_FOUND', 'Request not found.', 404);
    if (!['PENDING_APPROVAL', 'APPROVED'].includes(request.status)) {
      throw approvalError('ALREADY_DECIDED', 'This request cannot be cancelled in its current state.', 409);
    }
    const cancelled = await transition(tx, request, 'CANCELLED', { kind: 'USER', id: userId });
    await tx.query(
      `UPDATE approvals SET status = 'CANCELLED'
       WHERE org_id = $1 AND request_id = $2 AND status = 'PENDING'`,
      [orgId, requestId],
    );
    return cancelled;
  }, db);
  return result;
}

export async function expireApprovalsForOrg(orgId, { db } = {}) {
  requireId(orgId, 'orgId');
  return withTx(async (tx) => {
    const expired = await tx.query(
      `SELECT id, request_id FROM approvals
       WHERE org_id = $1 AND status = 'PENDING' AND expires_at <= now()
       ORDER BY expires_at, id
       LIMIT 100 FOR UPDATE SKIP LOCKED`,
      [orgId],
    );
    let count = 0;
    for (const approval of expired.rows) {
      const requestResult = await tx.query(
        'SELECT * FROM payment_requests WHERE org_id = $1 AND id = $2 FOR UPDATE',
        [orgId, approval.request_id],
      );
      const request = requestResult.rows[0];
      await tx.query(
        `UPDATE approvals SET status = $3
         WHERE org_id = $1 AND id = $2 AND status = 'PENDING'`,
        [orgId, approval.id, request?.status === 'PENDING_APPROVAL' ? 'EXPIRED' : 'CANCELLED'],
      );
      if (request?.status === 'PENDING_APPROVAL') {
        await transition(tx, request, 'EXPIRED', { kind: 'SYSTEM', id: 'approval-expiry' }, {
          ledgerPayload: { approvalId: approval.id, reasonCode: 'APPROVAL_EXPIRED' },
        });
        await notifyOrgRoles(tx, orgId, ['OWNER', 'ADMIN', 'APPROVER'], 'APPROVAL_EXPIRED', {
          approvalId: approval.id,
          requestId: request.id,
        });
        count += 1;
      }
    }
    return count;
  }, db);
}
