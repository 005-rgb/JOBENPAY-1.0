import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { parsePage, encodeCursor, pageResult } from '../../src/lib/cursor.js';

process.env.JOBENPAY_LEDGER_SIGNING_KEY = crypto.generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  publicKeyEncoding: { type: 'spki', format: 'der' },
}).privateKey.toString('base64');

const { requiresFourEyes } = await import('../../src/services/approvals.js');
const { assertNotFrozen, onFreeze } = await import('../../src/services/freeze.js');

test('four-eyes approval activates only above the configured minor-unit threshold', () => {
  assert.equal(requiresFourEyes('1500', 1500), false);
  assert.equal(requiresFourEyes('1501', 1500), true);
  assert.equal(requiresFourEyes('1500', null), false);
});

test('cursor pagination validates bounds and resumes from encoded timestamp and id', () => {
  const row = { created_at: '2026-11-01T08:00:00.000Z', id: '550e8400-e29b-41d4-a716-446655440000' };
  const cursor = encodeCursor(row);
  assert.deepEqual(parsePage({ limit: '10', cursor }), {
    limit: 10,
    cursor: { createdAt: row.created_at, id: row.id },
  });
  assert.deepEqual(pageResult([row, { ...row, id: '550e8400-e29b-41d4-a716-446655440001' }], 1), {
    items: [row],
    nextCursor: cursor,
  });
  assert.throws(() => parsePage({ limit: '101' }), { code: 'VALIDATION_FAILED' });
  assert.throws(() => parsePage({ cursor: 'not-a-cursor' }), { code: 'VALIDATION_FAILED' });
});

test('freeze guard rejects frozen organizations and allows active ones', async () => {
  const tx = {
    async query() {
      return { rowCount: 1, rows: [{ frozen_at: new Date().toISOString() }] };
    },
  };
  await assert.rejects(assertNotFrozen(tx, 'org-1'), { code: 'ORG_FROZEN', statusCode: 423 });

  tx.query = async () => ({ rowCount: 1, rows: [{ frozen_at: null }] });
  await assert.doesNotReject(assertNotFrozen(tx, 'org-1'));
});

test('freeze hook cancels eligible requests and delegates ledger transition', async () => {
  const state = { transitions: [], status: 'APPROVED' };
  const tx = {
    async query(sql) {
      const statement = sql.trim();
      if (statement.startsWith('SELECT * FROM payment_requests')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'request-1',
            org_id: 'org-1',
            status: state.status,
            reserved_period_id: 'period-1',
            reserved_amount_minor: '500',
            reserved_released: false,
          }],
        };
      }
      if (statement.startsWith('SELECT id FROM approvals')) return { rowCount: 0, rows: [] };
      if (statement.startsWith('UPDATE payment_requests')) {
        state.status = 'CANCELLED';
        return { rowCount: 1, rows: [{ status: state.status }] };
      }
      if (statement.startsWith('UPDATE mandate_budget_periods')) {
        return { rowCount: 1, rows: [{ id: 'period-1' }] };
      }
      if (statement.startsWith('INSERT INTO ledger_heads')) return { rowCount: 1, rows: [] };
      if (statement.startsWith('SELECT last_seq, last_hash')) {
        return { rowCount: 1, rows: [{ last_seq: 0, last_hash: '0'.repeat(64) }] };
      }
      if (statement.startsWith('INSERT INTO ledger_entries')) {
        state.transitions.push(statement);
        return { rowCount: 1, rows: [] };
      }
      if (statement.startsWith('UPDATE ledger_heads')) return { rowCount: 1, rows: [] };
      if (statement.startsWith('UPDATE approvals')) return { rowCount: 1, rows: [] };
      if (statement.startsWith('SELECT m.user_id FROM memberships')) return { rowCount: 0, rows: [] };
      throw new Error(`Unexpected SQL in freeze mock: ${statement}`);
    },
  };

  await assert.doesNotReject(onFreeze(tx, 'org-1'));
  assert.equal(state.status, 'CANCELLED');
});
