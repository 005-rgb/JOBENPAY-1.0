import test from 'node:test';
import assert from 'node:assert/strict';

import { processWebhook } from '../../src/jobs/webhook.js';

test('process_webhook requires tenant and event identifiers', async () => {
  await assert.rejects(() => processWebhook({ payload: {} }, { db: {} }), /requires orgId and eventId/);
  await assert.rejects(
    () => processWebhook({ payload: { orgId: 'ORG-1' } }, { db: {} }),
    /requires orgId and eventId/,
  );
});

test('process_webhook returns when no verified event exists', async () => {
  let queries = 0;
  const db = {
    async query() {
      queries += 1;
      return { rowCount: 0, rows: [] };
    },
  };

  await processWebhook({ payload: { orgId: 'ORG-1', eventId: 'MISSING' } }, { db });

  assert.equal(queries, 1);
});

test('process_webhook marks unknown verified events as ignored', async () => {
  const queries = [];
  const event = {
    id: 'ROW-1',
    org_id: 'ORG-1',
    paypal_event_id: 'EVENT-1',
    event_type: 'CHECKOUT.ORDER.APPROVED',
    payload: { id: 'EVENT-1', event_type: 'CHECKOUT.ORDER.APPROVED', resource: {} },
    processed_at: null,
  };
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('BEGIN') || sql.includes('COMMIT')) return { rowCount: 0, rows: [] };
      if (sql.includes('SELECT id, org_id, paypal_event_id')) return { rowCount: 1, rows: [event] };
      if (sql.includes('UPDATE webhook_events')) return { rowCount: 1, rows: [] };
      throw new Error(`Unexpected SQL in webhook test: ${sql}`);
    },
    release() {},
  };
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rowCount: 1, rows: [event] };
    },
    async connect() {
      return client;
    },
  };

  await processWebhook(
    { payload: { orgId: 'ORG-1', eventId: 'EVENT-1' } },
    { db },
  );
  assert.ok(queries.some(({ sql, params }) => sql.includes('status = $3') && params[2] === 'IGNORED'));
});

test('process_webhook ignores payout events with no matching request', async () => {
  const event = {
    id: 'ROW-3',
    org_id: 'ORG-1',
    paypal_event_id: 'EVENT-3',
    event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
    payload: {
      id: 'EVENT-3',
      event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
      resource: { sender_item_id: 'MISSING-REQUEST' },
    },
    processed_at: null,
  };
  const updates = [];
  const db = {
    async query(sql) {
      if (sql.includes('SELECT id, org_id, paypal_event_id')) return { rowCount: 1, rows: [event] };
      if (sql.includes('FROM payment_requests r')) return { rowCount: 0, rows: [] };
      throw new Error(`Unexpected SQL in webhook test: ${sql}`);
    },
    async connect() {
      return {
        async query(sql, params) {
          if (sql.includes('BEGIN') || sql.includes('COMMIT')) return { rowCount: 0, rows: [] };
          if (sql.includes('UPDATE webhook_events')) {
            updates.push(params[2]);
            return { rowCount: 1, rows: [] };
          }
          throw new Error(`Unexpected transaction SQL in webhook test: ${sql}`);
        },
        release() {},
      };
    },
  };

  await processWebhook({ payload: { orgId: 'ORG-1', eventId: 'EVENT-3' } }, { db });

  assert.deepEqual(updates, ['IGNORED']);
});

test('process_webhook retries a payout event that arrives before execution is committed', async () => {
  const event = {
    id: 'ROW-2',
    org_id: 'ORG-1',
    paypal_event_id: 'EVENT-2',
    event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
    payload: {
      id: 'EVENT-2',
      event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
      resource: {
        sender_item_id: 'REQUEST-1',
        sender_batch_id: 'jp_REQUEST-1',
      },
    },
    processed_at: null,
  };
  const db = {
    async query(sql) {
      if (sql.includes('SELECT id, org_id, paypal_event_id')) return { rowCount: 1, rows: [event] };
      if (sql.includes('FROM payment_requests r')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'REQUEST-1',
            status: 'EXECUTING',
            execution_status: 'SENT',
            paypal_ref: null,
          }],
        };
      }
      throw new Error(`Unexpected SQL in webhook test: ${sql}`);
    },
  };

  await assert.rejects(
    () => processWebhook({ payload: { orgId: 'ORG-1', eventId: 'EVENT-2' } }, { db }),
    (error) => error.code === 'WEBHOOK_WAITING_FOR_EXECUTION',
  );
});

test('process_webhook escalates a payout that remains uncommitted after five attempts', async () => {
  const event = {
    id: 'ROW-4',
    org_id: 'ORG-1',
    paypal_event_id: 'EVENT-4',
    event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
    payload: {
      id: 'EVENT-4',
      event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
      resource: { sender_item_id: 'REQUEST-4' },
    },
    processed_at: null,
  };
  const statuses = [];
  const db = {
    async query(sql) {
      if (sql.includes('SELECT id, org_id, paypal_event_id')) return { rowCount: 1, rows: [event] };
      if (sql.includes('FROM payment_requests r')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'REQUEST-4',
            status: 'EXECUTING',
            execution_status: 'SENT',
            paypal_ref: null,
          }],
        };
      }
      throw new Error(`Unexpected SQL in webhook test: ${sql}`);
    },
    async connect() {
      return {
        async query(sql, params) {
          if (sql.includes('BEGIN') || sql.includes('COMMIT')) return { rowCount: 0, rows: [] };
          if (sql.includes('SELECT id, org_id, paypal_event_id')) return { rowCount: 1, rows: [event] };
          if (sql.includes('SELECT m.user_id FROM memberships')) return { rowCount: 0, rows: [] };
          if (sql.includes('UPDATE webhook_events')) {
            statuses.push(params[2]);
            return { rowCount: 1, rows: [] };
          }
          throw new Error(`Unexpected transaction SQL in webhook test: ${sql}`);
        },
        release() {},
      };
    },
  };

  await processWebhook(
    { attempts: 5, payload: { orgId: 'ORG-1', eventId: 'EVENT-4' } },
    { db },
  );

  assert.deepEqual(statuses, ['NEEDS_REVIEW']);
});
