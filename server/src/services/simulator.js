import { AppError } from '../lib/errors.js';
import { withTx } from '../db/tx.js';
import { appendEntry, LEDGER_TYPES } from './ledger.js';
import { transition } from './requestStateMachine.js';

function simulatorError(code, message, statusCode) {
  const error = new AppError(code, message);
  error.code = code;
  error.statusCode = statusCode;
  throw error;
}

export async function resetDemoBudget(orgId, actorId, db) {
  return withTx(async (tx) => {
    const org = await tx.query(
      'SELECT slug FROM organizations WHERE id = $1 FOR UPDATE',
      [orgId],
    );
    if (org.rows[0]?.slug !== 'jobenpay-demo') {
      simulatorError('FORBIDDEN', 'The simulator budget is only available for the synthetic demo organization.', 403);
    }

    const periods = await tx.query(
      `SELECT period.id, period.spent_minor, period.reserved_minor
       FROM mandate_budget_periods period
       JOIN mandate_versions version ON version.id = period.version_id AND version.org_id = period.org_id
       JOIN mandates mandate ON mandate.current_version_id = version.id AND mandate.org_id = version.org_id
       WHERE mandate.org_id = $1 AND mandate.status = 'ACTIVE'
       FOR UPDATE OF period`,
      [orgId],
    );
    if (periods.rows.some((period) => BigInt(period.spent_minor) > 0n)) {
      simulatorError(
        'DEMO_BUDGET_SPENT',
        'Committed demo payouts cannot be cleared without resetting the synthetic demo data.',
        409,
      );
    }

    const requests = await tx.query(
      `SELECT request.*
       FROM payment_requests request
       JOIN mandate_budget_periods period
         ON period.id = request.reserved_period_id AND period.org_id = request.org_id
       WHERE request.org_id = $1
         AND request.status IN ('PENDING_APPROVAL', 'APPROVED')
       ORDER BY request.created_at, request.id
       FOR UPDATE OF request`,
      [orgId],
    );
    for (const request of requests.rows) {
      await transition(tx, request, 'CANCELLED', { kind: 'USER', id: actorId }, {
        ledgerPayload: { reasonCode: 'DEMO_BUDGET_RESET' },
      });
      await tx.query(
        `UPDATE approvals SET status = 'CANCELLED'
         WHERE org_id = $1 AND request_id = $2 AND status = 'PENDING'`,
        [orgId, request.id],
      );
    }

    const remaining = await tx.query(
      `SELECT COALESCE(sum(reserved_minor), 0)::text AS reserved
       FROM mandate_budget_periods
       WHERE org_id = $1 AND id = ANY($2::uuid[])`,
      [orgId, periods.rows.map((period) => period.id)],
    );
    if (BigInt(remaining.rows[0].reserved) !== 0n) {
      simulatorError('DEMO_BUDGET_BUSY', 'A demo request is still using a budget reservation.', 409);
    }

    await appendEntry(tx, {
      orgId,
      type: LEDGER_TYPES.DEMO_RESET,
      subjectType: 'ORGANIZATION',
      subjectId: orgId,
      payload: {
        cancelledRequests: requests.rows.length,
        periodCount: periods.rows.length,
      },
    });
    return { cancelledRequests: requests.rows.length };
  }, db);
}
