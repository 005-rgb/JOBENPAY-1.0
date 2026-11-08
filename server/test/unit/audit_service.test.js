// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { queryAuditLog } from '../../src/services/audit_service.js';

test('audit_service unit tests', async (t) => {
  const orgId = crypto.randomUUID();
  const user1 = crypto.randomUUID();
  const user2 = crypto.randomUUID();

  t.before(async () => {
    // Seed audit_events
    await pool.query(`
      INSERT INTO audit_events (id, org_id, actor_id, action, details, created_at)
      VALUES
        ($1, $2, $3, 'mandate.activated', '{"resource_type": "mandate", "version": 1}'::jsonb, now() - interval '20 minutes'),
        ($4, $2, $3, 'mandate.paused', '{"resource_type": "mandate", "version": 1}'::jsonb, now() - interval '10 minutes'),
        ($5, $2, $6, 'agent.created', '{"resource_type": "agent", "name": "Agent Alpha"}'::jsonb, now() - interval '5 minutes')
    `, [crypto.randomUUID(), orgId, user1, crypto.randomUUID(), crypto.randomUUID(), user2]);
  });

  t.after(async () => {
    await pool.query('DELETE FROM audit_events WHERE org_id = $1', [orgId]);
    await pool.end();
  });

  await t.test('test_audit_query_by_user', async () => {
    const resUser1 = await queryAuditLog(orgId, { user_id: user1 });
    assert.equal(resUser1.events.length, 2);
    assert.ok(resUser1.events.every((e) => e.user_id === user1));

    const resUser2 = await queryAuditLog(orgId, { user_id: user2 });
    assert.equal(resUser2.events.length, 1);
    assert.equal(resUser2.events[0].user_id, user2);
    assert.equal(resUser2.events[0].action, 'agent.created');
  });

  await t.test('test_audit_query_by_time_range', async () => {
    const now = Date.now();
    const fromTime = new Date(now - 15 * 60 * 1000).toISOString(); // last 15 min
    const resRange = await queryAuditLog(orgId, { from: fromTime });
    // Expect 2 events (paused 10m ago and created 5m ago)
    assert.equal(resRange.events.length, 2);
    assert.equal(resRange.events[0].action, 'agent.created');
    assert.equal(resRange.events[1].action, 'mandate.paused');
  });
});
