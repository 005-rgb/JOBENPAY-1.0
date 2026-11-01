import test from 'node:test';
import assert from 'node:assert/strict';

import { getHandler, JOB_TYPES, registerHandler } from '../../src/jobs/registry.js';
import { expireApprovals, scheduleApprovalExpiry } from '../../src/jobs/expireApprovals.js';
import { nextDemoReset, scheduleDemoReset } from '../../src/jobs/resetDemoData.js';

test('job registry contains the supported job types', () => {
  assert.deepEqual(JOB_TYPES, [
    'extract_document',
    'evaluate_request',
    'execute_request',
    'reconcile_request',
    'process_webhook',
    'sync_disputes',
    'draft_dispute_case',
    'submit_dispute_action',
    'send_email',
    'expire_approvals',
    'cleanup',
    'reset_demo_data',
  ]);
});

test('execution, reconciliation, and webhook handlers are registered', async () => {
  await assert.rejects(
    async () => getHandler('execute_request')({ payload: {} }, {}),
    /execute_request requires orgId and requestId/,
  );
  await assert.rejects(
    async () => getHandler('reconcile_request')({ payload: {} }, {}),
    /reconcile_request requires orgId and requestId/,
  );
  await assert.rejects(
    async () => getHandler('process_webhook')({ payload: {} }, {}),
    /process_webhook requires orgId and eventId/,
  );
});

test('unimplemented handlers fail with NOT_IMPLEMENTED', async () => {
  await assert.rejects(
    async () => getHandler('sync_disputes')({}, {}),
    { code: 'NOT_IMPLEMENTED', message: 'NOT_IMPLEMENTED' },
  );
});

test('approval expiry job runs and schedules a deduplicated follow-up each minute', async () => {
  const statements = [];
  const db = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.includes('SELECT DISTINCT org_id FROM approvals')) return { rowCount: 0, rows: [] };
      if (sql.includes('INSERT INTO jobs')) {
        return { rowCount: 1, rows: [{ id: 'expiry-job' }] };
      }
      throw new Error(`Unexpected SQL in approval expiry test: ${sql}`);
    },
  };
  await scheduleApprovalExpiry(db, new Date('2026-11-01T10:20:30.000Z'));
  await expireApprovals({}, { db });

  const scheduled = statements.filter(({ sql }) => sql.includes('INSERT INTO jobs'));
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[0].params[1], 'expire_approvals');
  assert.match(scheduled[0].params[4], /^job:expire-approvals:20261101T102000000Z$/);
  assert.equal(scheduled[1].params[1], 'expire_approvals');
  assert.match(scheduled[1].params[4], /^job:expire-approvals:/);
});

test('demo reset is scheduled for 03:00 WIB with a date-scoped dedupe key', async () => {
  const before = nextDemoReset(new Date('2026-11-01T19:59:00.000Z'));
  assert.equal(before.runAt.toISOString(), '2026-11-01T20:00:00.000Z');
  assert.equal(before.dedupeKey, 'demo-reset:2026-11-02');

  const after = nextDemoReset(new Date('2026-11-01T20:01:00.000Z'));
  assert.equal(after.runAt.toISOString(), '2026-11-02T20:00:00.000Z');
  assert.equal(after.dedupeKey, 'demo-reset:2026-11-03');

  const statements = [];
  const db = {
    async query(sql, params) {
      statements.push({ sql, params });
      return { rowCount: 1 };
    },
  };
  await scheduleDemoReset(db, new Date('2026-11-01T19:59:00.000Z'));
  assert.equal(statements[0].params[0].toISOString(), '2026-11-01T20:00:00.000Z');
  assert.equal(statements[0].params[1], 'demo-reset:2026-11-02');
});

test('job registry rejects unsupported types and invalid handlers', () => {
  assert.throws(() => registerHandler('unknown', async () => {}), /Unsupported job type/);
  assert.throws(() => registerHandler('send_email', null), /must be a function/);
});
