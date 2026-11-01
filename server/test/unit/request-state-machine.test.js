import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const signingKey = crypto.generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  publicKeyEncoding: { type: 'spki', format: 'der' },
}).privateKey.toString('base64');
process.env.JOBENPAY_LEDGER_SIGNING_KEY = signingKey;

const { GRAPH, transition } = await import('../../src/services/requestStateMachine.js');

function transactionMock(initial) {
  const state = {
    request: { ...initial },
    seq: 0,
    ledger: [],
    releases: 0,
    spends: 0,
  };
  return {
    state,
    tx: {
      async query(sql, params = []) {
        const statement = sql.trim();
        if (statement.startsWith('UPDATE payment_requests')) {
          if (params.length === 9) {
            if (state.request.status !== params[7]) return { rowCount: 0, rows: [] };
            state.request = { ...state.request, status: params[0] };
            return { rowCount: 1, rows: [state.request] };
          }
          state.request.reserved_released = true;
          return { rowCount: 1, rows: [state.request] };
        }
        if (statement.startsWith('SELECT m.user_id FROM memberships')) {
          return { rowCount: 0, rows: [] };
        }
        if (statement.startsWith('UPDATE mandate_budget_periods')) {
          if (statement.includes('spent_minor = spent_minor +')) state.spends += 1;
          else state.releases += 1;
          return { rowCount: 1, rows: [{ id: 'period-1' }] };
        }
        if (statement.startsWith('INSERT INTO ledger_heads')) return { rowCount: 1, rows: [] };
        if (statement.startsWith('SELECT last_seq, last_hash')) {
          return { rowCount: 1, rows: [{ last_seq: state.seq, last_hash: '0'.repeat(64) }] };
        }
        if (statement.startsWith('INSERT INTO ledger_entries')) {
          state.seq += 1;
          state.ledger.push({ type: params[2], payload: params[5] });
          return { rowCount: 1, rows: [] };
        }
        if (statement.startsWith('UPDATE ledger_heads')) return { rowCount: 1, rows: [] };
        throw new Error(`Unexpected SQL in transition mock: ${statement}`);
      },
    },
  };
}

const legalEdges = Object.entries(GRAPH).flatMap(([from, destinations]) => (
  destinations.map((to) => [from, to])
));
const allStates = [
  'RECEIVED', 'EVALUATING', 'REJECTED', 'PENDING_APPROVAL', 'APPROVED', 'EXPIRED',
  'CANCELLED', 'EXECUTING', 'EXECUTED', 'RECONCILED', 'MISMATCH', 'FAILED',
];

test('every legal request transition updates status and appends one ledger event', async () => {
  for (const [from, to] of legalEdges) {
    const { tx, state } = transactionMock({ id: 'request-1', org_id: 'org-1', status: from });
    const updated = await transition(tx, state.request, to, { kind: 'SYSTEM', id: 'state-test' });
    assert.equal(updated.status, to, `${from} -> ${to}`);
    assert.equal(state.ledger.length, 1, `${from} -> ${to} ledger`);
    assert.deepEqual(state.ledger[0].payload.actor, { kind: 'SYSTEM', id: 'state-test' });
    if (to === 'EVALUATING') assert.equal(state.ledger[0].type, 'REQUEST_EVALUATING');
    if (to === 'MISMATCH') assert.equal(state.ledger[0].type, 'MISMATCH');
  }
});

test('all illegal pairs in the full 12 by 12 state matrix throw ILLEGAL_TRANSITION', async () => {
  for (const from of allStates) {
    for (const to of allStates) {
      if (GRAPH[from]?.includes(to)) continue;
      const { tx, state } = transactionMock({ id: 'request-1', org_id: 'org-1', status: from });
      await assert.rejects(
        transition(tx, state.request, to, { kind: 'SYSTEM', id: 'state-test' }),
        (error) => error.code === 'ILLEGAL_TRANSITION',
        `${from} -> ${to}`,
      );
      assert.equal(state.ledger.length, 0, `${from} -> ${to} must not append ledger`);
    }
  }
});

test('rejected transitions release a reservation once; EXECUTED commits it to spend', async () => {
  const rejected = transactionMock({
    id: 'request-1', org_id: 'org-1', status: 'PENDING_APPROVAL',
    reserved_period_id: 'period-1', reserved_amount_minor: '50', reserved_released: false,
  });

  test('uncertain failed payouts preserve the reservation for manual resolution', async () => {
    const uncertain = transactionMock({
      id: 'request-3', org_id: 'org-1', status: 'EXECUTING',
      reserved_period_id: 'period-1', reserved_amount_minor: '50', reserved_released: false,
    });
    await transition(uncertain.tx, uncertain.state.request, 'FAILED', { kind: 'SYSTEM', id: 'executor' }, {
      preserveReservation: true,
      reasonCodes: ['UNCERTAIN_NEEDS_MANUAL_CHECK'],
    });
    assert.equal(uncertain.state.releases, 0);
    assert.equal(uncertain.state.request.reserved_released, false);
  });
  await transition(rejected.tx, rejected.state.request, 'REJECTED', { kind: 'USER', id: 'user-1' });
  assert.equal(rejected.state.releases, 1);
  assert.equal(rejected.state.request.reserved_released, true);

  const executed = transactionMock({
    id: 'request-2', org_id: 'org-1', status: 'EXECUTING',
    reserved_period_id: 'period-1', reserved_amount_minor: '50', reserved_released: false,
  });
  await transition(executed.tx, executed.state.request, 'EXECUTED', { kind: 'SYSTEM', id: 'executor' });
  assert.equal(executed.state.spends, 1);
  assert.equal(executed.state.releases, 0);
  assert.equal(executed.state.request.reserved_released, true);
});
