import test from 'node:test';
import assert from 'node:assert/strict';

import { withTx } from '../../src/db/tx.js';

function createDatabase() {
  const queries = [];
  let released = false;
  const client = {
    async query(statement) {
      queries.push(statement);
    },
    release() {
      released = true;
    },
  };
  return {
    queries,
    client,
    get released() {
      return released;
    },
    async connect() {
      return client;
    },
  };
}

test('withTx commits successful work and releases its client', async () => {
  const db = createDatabase();
  const value = await withTx(async () => 'result', db);

  assert.equal(value, 'result');
  assert.deepEqual(db.queries, ['BEGIN', 'COMMIT']);
  assert.equal(db.released, true);
});

test('withTx rolls back failed work and rethrows the original error', async () => {
  const db = createDatabase();
  const failure = new Error('transaction failed');

  await assert.rejects(withTx(async () => {
    throw failure;
  }, db), (error) => error === failure);

  assert.deepEqual(db.queries, ['BEGIN', 'ROLLBACK']);
  assert.equal(db.released, true);
});
