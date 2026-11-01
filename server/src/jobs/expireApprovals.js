import pool from '../db/pool.js';
import { enqueue } from './queue.js';
import { expireApprovalsForOrg } from '../services/approvals.js';

function minuteKey(date) {
  const atMinute = new Date(date);
  atMinute.setUTCSeconds(0, 0);
  return atMinute.toISOString().replaceAll(/[-:.]/g, '');
}

export async function scheduleApprovalExpiry(db = pool, now = new Date()) {
  const nextMinute = new Date(now);
  nextMinute.setUTCSeconds(0, 0);
  const dedupeKey = `job:expire-approvals:${minuteKey(nextMinute)}`;
  return enqueue(db, {
    type: 'expire_approvals',
    payload: {},
    runAt: now,
    dedupeKey,
  });
}

export async function expireApprovals(_job, { db = pool } = {}) {
  const organizations = await db.query(
    `SELECT DISTINCT org_id FROM approvals
     WHERE status = 'PENDING' AND expires_at <= now()
     ORDER BY org_id`,
  );
  for (const { org_id: orgId } of organizations.rows) {
    await expireApprovalsForOrg(orgId, { db });
  }
  const nextRun = new Date(Date.now() + 60_000);
  nextRun.setUTCSeconds(0, 0);
  await enqueue(db, {
    type: 'expire_approvals',
    payload: {},
    runAt: nextRun,
    dedupeKey: `job:expire-approvals:${minuteKey(nextRun)}`,
  });
}
