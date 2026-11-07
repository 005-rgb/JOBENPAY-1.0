/**
 * server/src/jobs/handlers/reconcileDaily.js
 * Background job handler for 'reconcile_daily' (WP F8-6)
 */

import { runDailyReconciliation } from '../../services/reconciliation/daily.js';

export async function reconcileDailyJob(job, { db } = {}) {
  const { orgId, since } = job.payload || {};
  return runDailyReconciliation({ orgId, db, since });
}

