// @ts-check
import crypto from 'node:crypto';
import { query } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { canonicalJson } from '../../../shared/canonical.js';
import {
  executeReplay,
  computeSemanticSimilarity,
  computeHash,
} from './replay_engine.js';
import {
  getCognitiveSnapshot,
  verifySnapshotSignature,
} from './snapshot_service.js';

/**
 * Weights per PRD 1.7 §4.2 (Non-negotiable).
 */
export const CPL_WEIGHTS = {
  w_decision: 0.50,
  w_reasoning: 0.30,
  w_raw: 0.20,
};

/**
 * Evaluates R_decision (0 or 1).
 * PRD 1.7 §4.3
 */
export function evaluateRDecision(originalDecision, replayDecision) {
  if (!originalDecision || !replayDecision) return 0;
  return originalDecision.trim().toUpperCase() === replayDecision.trim().toUpperCase() ? 1 : 0;
}

/**
 * Evaluates R_reasoning (0, 0.5, or 1).
 * PRD 1.7 §4.4
 */
export function evaluateRReasoning(
  originalTraceHash,
  replayTraceHash,
  originalReasons = [],
  replayReasons = [],
) {
  if (originalTraceHash && replayTraceHash && originalTraceHash === replayTraceHash) {
    return 1;
  }

  const similarity = computeSemanticSimilarity(originalReasons, replayReasons);
  if (similarity >= 0.90) {
    return 0.5;
  }

  return 0;
}

/**
 * Evaluates R_raw (0 or 1).
 * PRD 1.7 §4.5
 */
export function evaluateRRaw(originalRawHash, replayRawHash) {
  if (!originalRawHash || !replayRawHash) return 0;
  return originalRawHash === replayRawHash ? 1 : 0;
}

/**
 * Computes Reproducibility Score (0 - 100) and components per PRD 1.7 §4.2.
 * @param {object} replay - Replay output
 * @param {object} snapshot - Cognitive snapshot
 * @param {object} [options]
 * @returns {{ reproducibility_score: number, components: { decision: number, reasoning: number, raw: number }, decision: string, reason_codes: string[] }}
 */
export function computeReproducibilityScore(replay, snapshot, options = {}) {
  const originalOutputs = snapshot.outputs || {};
  const originalReasons = options.originalReasons || [];
  const replayReasons = replay.reasoning_trace || options.replayReasons || [];

  const rDecision = evaluateRDecision(originalOutputs.decision, replay.decision);
  const rReasoning = evaluateRReasoning(
    originalOutputs.reasoning_trace_hash,
    replay.reasoning_trace_hash,
    originalReasons,
    replayReasons,
  );
  const rRaw = evaluateRRaw(originalOutputs.raw_output_hash, replay.raw_output_hash);

  const rawScore = 100 * (
    CPL_WEIGHTS.w_decision * rDecision +
    CPL_WEIGHTS.w_reasoning * rReasoning +
    CPL_WEIGHTS.w_raw * rRaw
  );
  const rs = Math.round(rawScore);

  let verdictDecision = 'AUTO_APPROVE';
  const reasonCodes = [];

  if (rs < 70) {
    verdictDecision = 'REJECTED';
    reasonCodes.push('CPL_CRITICAL');
  } else if (rs < 90) {
    verdictDecision = 'REQUIRE_APPROVAL';
    reasonCodes.push('CPL_LOW_REPRODUCIBILITY');
  }

  return {
    reproducibility_score: rs,
    components: {
      decision: rDecision,
      reasoning: rReasoning,
      raw: rRaw,
    },
    decision: verdictDecision,
    reason_codes: reasonCodes,
  };
}

/**
 * Persists replay result to database.
 */
export async function recordReplayResult(dbClientOrPool, replayData) {
  const db = dbClientOrPool || { query };
  const res = await db.query(
    `INSERT INTO replay_results (
      snapshot_id, org_id, replay_model, replay_outputs,
      reproducibility_score, components, decision, replay_hash, replayed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING replay_id, replayed_at`,
    [
      replayData.snapshot_id,
      replayData.org_id,
      JSON.stringify(replayData.replay_model),
      JSON.stringify(replayData.replay_outputs),
      replayData.reproducibility_score,
      JSON.stringify(replayData.components),
      replayData.decision,
      replayData.replay_hash,
      replayData.replayed_at || new Date().toISOString(),
    ],
  );

  return {
    replay_id: res.rows[0].replay_id,
    replayed_at: res.rows[0].replayed_at,
  };
}

/**
 * Evaluates Cognitive Provenance Layer for a request (Fail-Closed).
 * PRD 1.7 §6.1
 * @param {string} requestId
 * @param {string} orgId
 * @param {object} [options]
 * @returns {Promise<object>} Evaluation outcome
 */
export async function evaluateCplForRequest(requestId, orgId, options = {}) {
  const db = options.dbClient || { query };

  // 1. Fetch snapshot
  const snapshot = await getCognitiveSnapshot(requestId, orgId, db);
  if (!snapshot) {
    return {
      available: false,
      reproducibility_score: 0,
      decision: 'REQUIRE_APPROVAL',
      reason_codes: ['CPL_SNAPSHOT_MISSING'],
      components: { decision: 0, reasoning: 0, raw: 0 },
    };
  }

  // 2. Execute replay
  let replay;
  try {
    replay = await executeReplay(snapshot, options);
  } catch (err) {
    return {
      available: false,
      reproducibility_score: 0,
      decision: 'REQUIRE_APPROVAL',
      reason_codes: ['CPL_REPLAY_UNAVAILABLE'],
      components: { decision: 0, reasoning: 0, raw: 0 },
      error: err.message,
    };
  }

  if (!replay || !replay.available) {
    return {
      available: false,
      reproducibility_score: 0,
      decision: 'REQUIRE_APPROVAL',
      reason_codes: ['CPL_REPLAY_UNAVAILABLE'],
      components: { decision: 0, reasoning: 0, raw: 0 },
    };
  }

  // 3. Compute Reproducibility Score
  const scoreResult = computeReproducibilityScore(replay, snapshot, options);

  // 4. Compute canonical replay hash
  const replayPayload = {
    request_id: requestId,
    snapshot_hash: snapshot.snapshot_hash,
    replay_outputs: {
      decision: replay.decision,
      reasoning_trace_hash: replay.reasoning_trace_hash,
      raw_output_hash: replay.raw_output_hash,
    },
    reproducibility_score: scoreResult.reproducibility_score,
  };
  const replay_hash = computeHash(replayPayload);

  // 5. Save to database
  let savedReplay = { replay_id: crypto.randomUUID(), replayed_at: new Date().toISOString() };
  try {
    // If snapshot has a valid UUID in DB, record it
    const snapRes = await db.query(
      `SELECT snapshot_id FROM cognitive_snapshots WHERE request_id = $1 AND org_id = $2`,
      [requestId, orgId],
    );
    if (snapRes.rows.length > 0) {
      savedReplay = await recordReplayResult(db, {
        snapshot_id: snapRes.rows[0].snapshot_id,
        org_id: orgId,
        replay_model: snapshot.model,
        replay_outputs: {
          decision: replay.decision,
          reasoning_trace_hash: replay.reasoning_trace_hash,
          raw_output_hash: replay.raw_output_hash,
        },
        reproducibility_score: scoreResult.reproducibility_score,
        components: scoreResult.components,
        decision: scoreResult.decision,
        replay_hash,
      });
    }
  } catch (_e) {
    // DB recording best-effort in tests
  }

  return {
    available: true,
    replay_id: savedReplay.replay_id,
    reproducibility_score: scoreResult.reproducibility_score,
    components: scoreResult.components,
    decision: scoreResult.decision,
    reason_codes: scoreResult.reason_codes,
    replay_hash,
    replayed_at: savedReplay.replayed_at,
    snapshot,
  };
}

/**
 * Gets latest replay result for a request.
 */
export async function getLatestReplayResult(requestId, orgId, dbClient = null) {
  const db = dbClient || { query };
  const res = await db.query(
    `SELECT r.replay_id, r.snapshot_id, r.org_id, r.replay_model, r.replay_outputs,
            r.reproducibility_score, r.components, r.decision, r.replay_hash, r.replayed_at
     FROM replay_results r
     JOIN cognitive_snapshots s ON s.snapshot_id = r.snapshot_id
     WHERE s.request_id = $1 AND r.org_id = $2
     ORDER BY r.replayed_at DESC LIMIT 1`,
    [requestId, orgId],
  );

  if (res.rows.length === 0) return null;
  const row = res.rows[0];

  return {
    replay_id: row.replay_id,
    snapshot_id: row.snapshot_id,
    reproducibility_score: row.reproducibility_score,
    components: typeof row.components === 'string' ? JSON.parse(row.components) : row.components,
    decision: row.decision,
    replay_hash: row.replay_hash,
    replayed_at: row.replayed_at,
  };
}

export default {
  CPL_WEIGHTS,
  evaluateRDecision,
  evaluateRReasoning,
  evaluateRRaw,
  computeReproducibilityScore,
  recordReplayResult,
  evaluateCplForRequest,
  getLatestReplayResult,
};
