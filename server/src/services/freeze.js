import { AppError } from '../lib/errors.js';
import { notifyOrgRoles } from '../repositories/notifications.js';
import { transition } from './requestStateMachine.js';

function freezeError() {
  const error = new AppError('ORG_FROZEN', 'The organization is frozen.');
  error.statusCode = 423;
  return error;
}

export async function assertNotFrozen(tx, orgId) {
  if (!orgId) throw new Error('orgId is required to check the organization freeze state.');
  const result = await tx.query('SELECT frozen_at FROM organizations WHERE id = $1 FOR SHARE', [orgId]);
  if (!result.rowCount) {
    const error = new AppError('NOT_FOUND', 'Organization not found.');
    error.statusCode = 404;
    throw error;
  }
  if (result.rows[0].frozen_at) throw freezeError();
}

export async function onFreeze(tx, orgId) {
  if (!orgId) throw new Error('orgId is required to cancel requests on freeze.');
  await tx.query(
    `SELECT id FROM approvals WHERE org_id = $1 AND status = 'PENDING' FOR UPDATE`,
    [orgId],
  );
  const requests = await tx.query(
    `SELECT * FROM payment_requests
     WHERE org_id = $1 AND status IN ('PENDING_APPROVAL', 'APPROVED')
     ORDER BY created_at, id FOR UPDATE`,
    [orgId],
  );
  for (const request of requests.rows) {
    await transition(tx, request, 'CANCELLED', { kind: 'SYSTEM', id: 'org-freeze' }, {
      ledgerPayload: { reasonCode: 'ORG_FROZEN' },
    });
    await tx.query(
      `UPDATE approvals SET status = 'CANCELLED'
       WHERE org_id = $1 AND request_id = $2 AND status = 'PENDING'`,
      [orgId, request.id],
    );
  }
  if (requests.rowCount) {
    await notifyOrgRoles(tx, orgId, ['OWNER', 'ADMIN', 'APPROVER'], 'ORG_REQUESTS_CANCELLED', {
      cancelledRequestIds: requests.rows.map(({ id }) => id),
      reasonCode: 'ORG_FROZEN',
    });
  }
  return requests.rowCount;
}
