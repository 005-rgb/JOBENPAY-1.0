import pool from '../db/pool.js';
import { env } from '../config.js';
import { AiError } from './errors.js';

const DAILY_CALL_LIMIT = 100;
const MAX_OUTPUT_TOKENS = 2048;

function utcDayRange(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function estimatedCost(inputBytes) {
  const inputPrice = String(env.AI_PRICE_IN_PER_MTOK);
  const outputPrice = String(env.AI_PRICE_OUT_PER_MTOK);
  return {
    inputPrice,
    outputPrice,
    inputTokens: Math.max(0, Math.ceil(inputBytes)),
    outputTokens: env.AI_PROVIDER === 'replay' ? 0 : MAX_OUTPUT_TOKENS,
  };
}

export async function reserveAiUsage(orgId, task, inputBytes, db = pool) {
  if (!orgId) throw new AiError('TENANT', 'An organization is required for AI processing.');
  const client = await db.connect();
  const { start, end } = utcDayRange();
  const prices = estimatedCost(inputBytes);
  let usageId;

  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      [orgId, start.toISOString().slice(0, 10)],
    );
    const totals = await client.query(`
      SELECT count(*)::integer AS calls,
             coalesce(sum(cost_usd + reserved_cost_usd), 0)::text AS committed_cost
      FROM ai_usage
      WHERE org_id = $1 AND created_at >= $2 AND created_at < $3
    `, [orgId, start, end]);
    const calls = Number(totals.rows[0].calls);
    const committedCost = Number(totals.rows[0].committed_cost);
    const budget = env.AI_DAILY_BUDGET_USD;
    if (calls >= DAILY_CALL_LIMIT || committedCost >= budget) {
      throw new AiError('BUDGET', 'The organization AI budget or daily call limit has been reached.');
    }

    const created = await client.query(`
      INSERT INTO ai_usage (org_id, task, reserved_input_tokens, reserved_output_tokens, reserved_cost_usd)
      VALUES (
        $1, $2, $3, $4,
        (($3::integer * $5::numeric) + ($4::integer * $6::numeric)) / 1000000
      )
      RETURNING id, reserved_cost_usd::text
    `, [orgId, task, prices.inputTokens, prices.outputTokens, prices.inputPrice, prices.outputPrice]);
    usageId = created.rows[0].id;
    const proposedTotal = committedCost + Number(created.rows[0].reserved_cost_usd);
    if (proposedTotal >= budget) {
      throw new AiError('BUDGET', 'The organization AI budget or daily call limit has been reached.');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof AiError) throw error;
    throw new AiError('USAGE', 'AI usage could not be reserved.', { cause: error });
  } finally {
    client.release();
  }

  return {
    id: usageId,
    async settle({ inputTokens = 0, outputTokens = 0 } = {}) {
      const actualInput = Number.isSafeInteger(inputTokens) && inputTokens > 0 ? inputTokens : 0;
      const actualOutput = Number.isSafeInteger(outputTokens) && outputTokens > 0 ? outputTokens : 0;
      try {
        const result = await db.query(`
          UPDATE ai_usage
          SET input_tokens = $2,
              output_tokens = $3,
              cost_usd = (($2::integer * $4::numeric) + ($3::integer * $5::numeric)) / 1000000,
              reserved_cost_usd = 0,
              reserved_input_tokens = 0,
              reserved_output_tokens = 0
          WHERE id = $1 AND org_id = $6 AND reserved_cost_usd >= 0
          RETURNING id
        `, [usageId, actualInput, actualOutput, prices.inputPrice, prices.outputPrice, orgId]);
        if (result.rowCount !== 1) throw new Error('AI usage reservation is missing.');
      } catch (error) {
        throw new AiError('USAGE', 'AI usage could not be recorded.', { cause: error });
      }
    },
  };
}
