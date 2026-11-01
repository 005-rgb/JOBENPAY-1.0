import test from 'node:test';
import assert from 'node:assert/strict';

import { env } from '../../src/config.js';
import { reserveAiUsage } from '../../src/ai/usage.js';
import { AiError } from '../../src/ai/errors.js';

function createUsageDatabase({ calls = 0, committedCost = '0', reservedCost = '0.008212' } = {}) {
  const statements = [];
  const client = {
    async query(sql, values = []) {
      statements.push({ sql, values });
      if (sql.includes('SELECT count(*)::integer AS calls')) {
        return { rows: [{ calls, committed_cost: committedCost }] };
      }
      if (sql.includes('INSERT INTO ai_usage')) {
        return { rows: [{ id: 'usage-id', reserved_cost_usd: reservedCost }] };
      }
      return { rowCount: 0 };
    },
    release() {},
  };
  return {
    statements,
    async connect() {
      return client;
    },
    async query(sql, values = []) {
      statements.push({ sql, values });
      return { rowCount: 1 };
    },
  };
}

test('daily AI call limit rejects before reserving or calling a provider', async () => {
  const db = createUsageDatabase({ calls: 100 });
  await assert.rejects(
    reserveAiUsage('org-id', 'extractInvoice', 100, db),
    (error) => error instanceof AiError && error.kind === 'BUDGET',
  );
  assert.equal(db.statements.some(({ sql }) => sql.includes('INSERT INTO ai_usage')), false);
  assert.ok(db.statements.some(({ sql }) => sql === 'ROLLBACK'));
});

test('reservation that would reach the daily budget fails before provider use', async (t) => {
  const original = {
    provider: env.AI_PROVIDER,
    inputPrice: env.AI_PRICE_IN_PER_MTOK,
    outputPrice: env.AI_PRICE_OUT_PER_MTOK,
  };
  t.after(() => {
    env.AI_PROVIDER = original.provider;
    env.AI_PRICE_IN_PER_MTOK = original.inputPrice;
    env.AI_PRICE_OUT_PER_MTOK = original.outputPrice;
  });
  env.AI_PROVIDER = 'anthropic';
  env.AI_PRICE_IN_PER_MTOK = 2;
  env.AI_PRICE_OUT_PER_MTOK = 4;

  const db = createUsageDatabase({ committedCost: '4.991788', reservedCost: '0.008212' });
  await assert.rejects(
    reserveAiUsage('org-id', 'extractInvoice', 10, db),
    (error) => error instanceof AiError && error.kind === 'BUDGET',
  );
  assert.ok(db.statements.some(({ sql }) => sql === 'ROLLBACK'));
});

test('AI usage reservations price tokens and settle provider-reported usage', async (t) => {
  const original = {
    provider: env.AI_PROVIDER,
    inputPrice: env.AI_PRICE_IN_PER_MTOK,
    outputPrice: env.AI_PRICE_OUT_PER_MTOK,
  };
  t.after(() => {
    env.AI_PROVIDER = original.provider;
    env.AI_PRICE_IN_PER_MTOK = original.inputPrice;
    env.AI_PRICE_OUT_PER_MTOK = original.outputPrice;
  });
  env.AI_PROVIDER = 'anthropic';
  env.AI_PRICE_IN_PER_MTOK = 2;
  env.AI_PRICE_OUT_PER_MTOK = 4;

  const db = createUsageDatabase();
  const reservation = await reserveAiUsage('org-id', 'extractInvoice', 10, db);
  const insert = db.statements.find(({ sql }) => sql.includes('INSERT INTO ai_usage'));
  assert.deepEqual(insert.values.slice(2), [10, 2048, '2', '4']);

  await reservation.settle({ inputTokens: 3, outputTokens: 5 });
  const settlement = db.statements.find(({ sql }) => sql.includes('UPDATE ai_usage'));
  assert.deepEqual(settlement.values, ['usage-id', 3, 5, '2', '4', 'org-id']);
});
