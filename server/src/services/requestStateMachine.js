import { AppError } from '../lib/errors.js';
import { appendEntry, LEDGER_TYPES } from './ledger.js';
import { commitSpend, release } from './budget.js';

const GRAPH = Object.freeze({
  RECEIVED: ['EVALUATING'],
  EVALUATING: ['REJECTED', 'PENDING_APPROVAL', 'APPROVED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  APPROVED: ['EXECUTING', 'CANCELLED'],
  EXECUTING: ['EXECUTED', 'FAILED'],
  EXECUTED: ['RECONCILED', 'MISMATCH'],
});

const RELEASE_STATES = new Set(['REJECTED', 'CANCELLED', 'EXPIRED', 'FAILED']);

function transitionError(from, to) {
  const error = new AppError('ILLEGAL_TRANSITION', `Illegal request transition ${from} -> ${to}.`);
  error.statusCode = 409;
  return error;
}

function ledgerType(to, meta = {}) {
  if (meta.ledgerType) return meta.ledgerType;
  if (to === 'EXECUTED') return LEDGER_TYPES.EXECUTION_RESULT;
  if (to === 'RECONCILED' || to === 'MISMATCH') return LEDGER_TYPES.RECONCILED;
  if (to === 'EXECUTING') return LEDGER_TYPES.EXECUTION_STARTED;
  if (to === 'REJECTED' || to === 'PENDING_APPROVAL' || to === 'APPROVED') return LEDGER_TYPES.REQUEST_DECIDED;
  return LEDGER_TYPES.REQUEST_CANCELLED;
}

function actorPayload(actor) {
  if (!actor || !['AGENT', 'USER', 'SYSTEM'].includes(actor.kind) || !actor.id) {
    throw new AppError('VALIDATION_FAILED', 'A transition actor with kind and id is required.');
  }
  return { kind: actor.kind, id: actor.id };
}

export async function transition(tx, request, to, actor, meta = {}) {
  const from = request.status;
  if (!GRAPH[from]?.includes(to)) throw transitionError(from, to);
  const actorValue = actorPayload(actor);
  const updated = await tx.query(
    `UPDATE payment_requests
     SET status = $1,
         decision = COALESCE($2, decision),
         reason_codes = COALESCE($3::text[], reason_codes),
         explanation = COALESCE($4, explanation),
         reserved_released = CASE WHEN $1 = ANY($5::text[]) THEN true ELSE reserved_released END
     WHERE id = $6 AND org_id = $7 AND status = $8
     RETURNING *`,
    [
      to,
      meta.decision ?? null,
      meta.reasonCodes ?? null,
      meta.explanation ?? null,
      [...RELEASE_STATES],
      request.id,
      request.org_id,
      from,
    ],
  );
  if (!updated.rowCount) {
    const error = new AppError('ILLEGAL_TRANSITION', 'Request status changed concurrently.');
    error.statusCode = 409;
    throw error;
  }
  const current = updated.rows[0];

  if (RELEASE_STATES.has(to) && request.reserved_released !== true && request.reserved_period_id) {
    await release(tx, request.reserved_period_id, request.reserved_amount_minor ?? request.amount_minor);
    await tx.query(
      'UPDATE payment_requests SET reserved_released = true WHERE id = $1 AND org_id = $2',
      [request.id, request.org_id],
    );
  }
  if (to === 'EXECUTED' && request.reserved_period_id && request.reserved_released !== true) {
    await commitSpend(tx, request.reserved_period_id, request.reserved_amount_minor ?? request.amount_minor);
    await tx.query(
      'UPDATE payment_requests SET reserved_released = true WHERE id = $1 AND org_id = $2',
      [request.id, request.org_id],
    );
  }

  await appendEntry(tx, {
    orgId: request.org_id,
    type: ledgerType(to, meta),
    subjectType: 'PAYMENT_REQUEST',
    subjectId: request.id,
    payload: {
      requestId: request.id,
      from,
      to,
      actor: actorValue,
      ...(meta.ledgerPayload || {}),
    },
  });
  return current;
}

export function isLegalTransition(from, to) {
  return Boolean(GRAPH[from]?.includes(to));
}

export { GRAPH, RELEASE_STATES };
