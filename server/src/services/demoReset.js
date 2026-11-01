import { randomUUID } from 'node:crypto';

import pool from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { appendEntry, LEDGER_TYPES } from './ledger.js';
import { seedDemoData } from '../../scripts/seed.js';

const DEMO_ORG_SLUG = 'jobenpay-demo';
const RESET_LOCK_KEY = 20261101;

export async function resetDemoOrganization(db = pool) {
  const lock = await db.connect();
  let locked = false;
  const nextSlug = `jobenpay-demo-reset-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [RESET_LOCK_KEY]);
    locked = true;
    const active = await lock.query(
      'SELECT id FROM organizations WHERE slug = $1 AND archived_at IS NULL LIMIT 1',
      [DEMO_ORG_SLUG],
    );
    if (!active.rowCount) throw new Error('Active demo organization was not found.');

    await seedDemoData(db, {
      write: () => {},
      orgSlug: nextSlug,
      orgName: 'JOBENPAY Demo',
    });

    return await withTx(async (tx) => {
      const current = await tx.query(
        'SELECT id FROM organizations WHERE slug = $1 AND archived_at IS NULL FOR UPDATE',
        [DEMO_ORG_SLUG],
      );
      const replacement = await tx.query(
        'SELECT id FROM organizations WHERE slug = $1 AND archived_at IS NULL FOR UPDATE',
        [nextSlug],
      );
      if (!current.rowCount || !replacement.rowCount) {
        throw new Error('Demo organization changed during reset.');
      }

      const oldOrgId = current.rows[0].id;
      const newOrgId = replacement.rows[0].id;
      await tx.query(
        `UPDATE organizations
         SET slug = $2, archived_at = now()
         WHERE id = $1`,
        [oldOrgId, `jobenpay-archived-${oldOrgId}`],
      );
      await tx.query(
        `UPDATE organizations
         SET slug = $2, name = 'JOBENPAY Demo', archived_at = NULL
         WHERE id = $1`,
        [newOrgId, DEMO_ORG_SLUG],
      );
      const demoUsers = await tx.query(
        `SELECT id FROM users
         WHERE lower(email) = ANY($1::text[])`,
        [['owner@jobenpay.test', 'judge@jobenpay.test', 'approver@jobenpay.test', 'viewer@jobenpay.test']],
      );
      if (demoUsers.rowCount) {
        await tx.query(
          'UPDATE sessions SET current_org_id = $1 WHERE user_id = ANY($2::uuid[]) AND current_org_id = $3',
          [newOrgId, demoUsers.rows.map(({ id }) => id), oldOrgId],
        );
      }
      await appendEntry(tx, {
        orgId: newOrgId,
        type: LEDGER_TYPES.DEMO_RESET,
        subjectType: 'ORGANIZATION',
        subjectId: newOrgId,
        payload: { previousOrgId: oldOrgId, reason: 'scheduled_or_manual_demo_reset' },
      });
      return { organizationId: newOrgId, archivedOrganizationId: oldOrgId };
    }, db);
  } finally {
    if (locked) await lock.query('SELECT pg_advisory_unlock($1)', [RESET_LOCK_KEY]).catch(() => undefined);
    lock.release();
  }
}

export default { resetDemoOrganization };
