// @ts-check
import { query } from '../db/pool.js';
import { hasActiveVlei as checkVleiLegacy } from './vlei_service.js';
import { validateIntentMatch as validateIntent } from './intent_service.js';
import { computeDecisionIntegrityScore } from './dip_service.js';
import { computeReproducibilityScore } from './cpl_service.js';
import { transition, isValidTransition, AGGREGATE_STATES, AGGREGATE_TRANSITIONS, TAHAP_A_MAPPING } from '../../../shared/state-machine.js';
import { getFailClosedOutcome } from '../../../shared/fail-closed.js';
import { evaluate as jplEvaluate } from './jpl_evaluator.js';

function runQuery(sql, params, client) {
  if (client && typeof client.query === 'function') {
    return client.query(sql, params);
  }
  return query(sql, params);
}

/**
 * Tahap A1: Periksa apakah organisasi memiliki identitas vLEI aktif (PRD 2.0 §5.2 F1-2).
 * @param {string} orgId
 * @param {object} [dbClient]
 * @returns {Promise<boolean>}
 */
export async function hasActiveVlei(orgId, dbClient = null) {
  if (!orgId) return false;

  // 1. Periksa unified entities registry
  try {
    const res = await runQuery(
      `SELECT 1 FROM entities
       WHERE org_id = $1
         AND entity_type IN ('ISSUER', 'BOTH')
         AND status = 'ACTIVE'
         AND legal_entity_lei IS NOT NULL
       LIMIT 1`,
      [orgId],
      dbClient,
    );
    if ((res.rowCount && res.rowCount > 0) || (res.rows && res.rows.length > 0)) return true;
  } catch {
    // Abaikan jika tabel belum ada atau error koneksi
  }

  // 2. Periksa fallback legacy org_legal_identity
  try {
    return await checkVleiLegacy(orgId);
  } catch {
    return false;
  }
}

/**
 * Tahap A2: Validasi kesesuaian transaksi terhadap intent mandate (PRD 2.0 §5.2 F1-3).
 * @param {string} orgId
 * @param {string} intentMandateId
 * @param {object} transaction
 * @param {object} [dbClient]
 * @returns {Promise<{ valid: boolean, code?: string }>}
 */
export async function validateIntentMatch(orgId, intentMandateId, transaction, dbClient = null) {
  if (!intentMandateId) {
    return { valid: false, code: 'INTENT_MANDATE_MISSING' };
  }

  try {
    const result = await validateIntent(orgId, intentMandateId, transaction, dbClient);
    if (!result.valid) {
      return { valid: false, code: result.reason };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, code: 'INTENT_SERVICE_UNAVAILABLE' };
  }
}

/**
 * Tahap A3: Hitung Decision Integrity Proof (DIP) (PRD 2.0 §2.6, §5.2 F1-4).
 * @param {string} orgId
 * @param {object} transaction
 * @param {object} [dbClient]
 * @returns {Promise<{ score: number, hard_rule_triggered?: string, decision: string, code?: string }>}
 */
export async function computeDIP(orgId, transaction, dbClient = null) {
  // Jika score sudah disertakan langsung dalam mock/parameter transaksi
  if (typeof transaction?.dip_score === 'number' || typeof transaction?.dis_score === 'number') {
    const score = transaction.dip_score ?? transaction.dis_score;
    if (transaction.hard_rule_triggered) {
      if (transaction.hard_rule_triggered === 'DIP_INDETERMINATE') {
        return { score: 0, decision: 'REQUIRE_APPROVAL', code: 'DIP_INDETERMINATE' };
      }
      return { score, hard_rule_triggered: transaction.hard_rule_triggered, decision: 'REJECT', code: transaction.hard_rule_triggered };
    }
    if (score < 50) {
      return { score, decision: 'REJECT', code: 'DIP_CRITICAL' };
    }
    if (score < 80) {
      return { score, decision: 'REQUIRE_APPROVAL', code: 'DIP_LOW_SCORE' };
    }
    return { score, decision: 'PASS' };
  }

  // Jika terdapat intent anchor atau reasoning trace untuk evaluasi langsung
  if (transaction?.intent_anchor || transaction?.reasoning_trace) {
    try {
      const evaluation = await computeDecisionIntegrityScore({
        orgId,
        transaction,
        intentAnchor: transaction.intent_anchor,
        reasoningTrace: transaction.reasoning_trace,
        dbClient,
      });
      const score = evaluation.score;
      if (evaluation.hard_rule_triggered) {
        const isApproval = evaluation.decision === 'REQUIRE_APPROVAL';
        return {
          score,
          hard_rule_triggered: evaluation.hard_rule_triggered,
          decision: isApproval ? 'REQUIRE_APPROVAL' : 'REJECT',
          code: evaluation.hard_rule_triggered,
        };
      }
      return { score, decision: 'PASS' };
    } catch {
      return { score: 0, decision: 'REQUIRE_APPROVAL', code: 'DIP_INDETERMINATE' };
    }
  }

  // Default jika DIP tidak dapat dihitung
  return { score: 100, decision: 'PASS' };
}

/**
 * Tahap A4: Hitung Cognitive Provenance Layer (CPL) (PRD 2.0 §2.6, §5.2 F1-5).
 * Dijalankan HANYA jika DIP >= 80.
 * @param {string} orgId
 * @param {object} transaction
 * @param {object} [dbClient]
 * @returns {Promise<{ score: number, decision: string, code?: string }>}
 */
export async function computeCPL(orgId, transaction, dbClient = null) {
  if (typeof transaction?.cpl_score === 'number' || typeof transaction?.rs_score === 'number') {
    const score = transaction.cpl_score ?? transaction.rs_score;
    return {
      score,
      decision: score < 70 ? 'REJECT' : (score < 90 ? 'REQUIRE_APPROVAL' : 'PASS'),
      code: score < 70 ? 'CPL_CRITICAL' : (score < 90 ? 'CPL_LOW_REPRODUCIBILITY' : undefined),
    };
  }

  if (transaction?.replay && transaction?.snapshot) {
    try {
      const result = computeReproducibilityScore(transaction.replay, transaction.snapshot);
      const score = result.reproducibility_score;
      return {
        score,
        decision: score < 70 ? 'REJECT' : (score < 90 ? 'REQUIRE_APPROVAL' : 'PASS'),
        code: score < 70 ? 'CPL_CRITICAL' : (score < 90 ? 'CPL_LOW_REPRODUCIBILITY' : undefined),
      };
    } catch {
      return { score: 0, decision: 'REQUIRE_APPROVAL', code: 'CPL_REPLAY_UNAVAILABLE' };
    }
  }

  // Default passthrough jika tidak dispesifikasikan
  return { score: 100, decision: 'PASS' };
}

/**
 * Tahap B: Evaluasi Markers / Flag Kebijakan (PRD 2.0 §5.2 F1-6).
 * @param {object} context
 * @returns {{ requireApproval: boolean, markers: string[] }}
 */
export function checkMarkers(context = {}) {
  const markers = [];
  if (context.isNewPayee || context.markers?.includes('NEW_PAYEE')) {
    markers.push('NEW_PAYEE');
  }
  if (context.isHighVelocity || context.markers?.includes('HIGH_VELOCITY')) {
    markers.push('HIGH_VELOCITY');
  }
  if (context.isUnusualTime || context.markers?.includes('UNUSUAL_TIME')) {
    markers.push('UNUSUAL_TIME');
  }
  if (context.isLargeAmount || context.markers?.includes('LARGE_AMOUNT')) {
    markers.push('LARGE_AMOUNT');
  }
  if (context.flags?.length) {
    for (const f of context.flags) {
      markers.push(typeof f === 'string' ? f : f.code);
    }
  }

  return {
    requireApproval: markers.length > 0,
    markers: [...new Set(markers)],
  };
}

/**
 * Evaluasi kebijakan JPL pada Tahap B (PRD 2.0 §5.3 F2-5).
 * Mendukung objek policy tunggal, JSON string, atau array policy.
 * Menegakkan fail-closed: kegagalan evaluasi -> DENY -> decision: REJECT.
 * Menegakkan Explicit Deny Precedence: jika ada aturan DENY yang cocok, outcome DENY.
 *
 * @param {object|string|Array<object|string>} policyOrPolicies
 * @param {object} [input={}]
 * @returns {{ outcome: string, decision: string, rule_id: string|null, reason_code: string|null, outcome_params: object }}
 */
export function evaluatePolicy(policyOrPolicies, input = {}) {
  try {
    if (!policyOrPolicies) {
      return {
        outcome: 'PERMIT',
        decision: 'PASS',
        rule_id: null,
        reason_code: null,
        outcome_params: {},
      };
    }

    const policies = Array.isArray(policyOrPolicies) ? policyOrPolicies : [policyOrPolicies];
    if (policies.length === 0) {
      return {
        outcome: 'PERMIT',
        decision: 'PASS',
        rule_id: null,
        reason_code: null,
        outcome_params: {},
      };
    }

    let finalOutcome = 'PERMIT';
    let matchedRuleId = null;
    let matchedReasonCode = null;
    let matchedParams = {};

    for (const pol of policies) {
      const res = jplEvaluate(pol, input);

      if (res.outcome === 'DENY') {
        return {
          outcome: 'DENY',
          decision: 'REJECT',
          rule_id: res.rule_id,
          reason_code: res.reason_code || 'POLICY_DENY',
          outcome_params: res.outcome_params,
        };
      }

      if (res.outcome === 'REQUIRE_APPROVAL' || res.outcome === 'ESCALATE') {
        finalOutcome = 'REQUIRE_APPROVAL';
        matchedRuleId = res.rule_id;
        matchedReasonCode = res.reason_code;
        matchedParams = res.outcome_params;
      }
    }

    return {
      outcome: finalOutcome,
      decision: finalOutcome === 'PERMIT' ? 'PASS' : 'REQUIRE_APPROVAL',
      rule_id: matchedRuleId,
      reason_code: matchedReasonCode,
      outcome_params: matchedParams,
    };
  } catch (err) {
    // Fail-closed fallback: PRD 2.0 §2.7 JPL_EVALUATION_ERROR -> outcome: 'DENY'
    return {
      outcome: 'DENY',
      decision: 'REJECT',
      rule_id: null,
      reason_code: 'JPL_EVALUATION_ERROR',
      outcome_params: { error: err.message },
    };
  }
}

/**
 * Evaluasi menyeluruh Tahap B (Markers & JPL Policy) (PRD 2.0 §5.2 F1-6, §5.3 F2-5).
 * @param {object} [transaction={}]
 * @param {object} [context={}]
 * @returns {{ requireApproval: boolean, decision: string, code?: string, reason_code?: string, markers: string[], policy?: object|null }}
 */
export function evaluateStageB(transaction = {}, context = {}) {
  const markersResult = checkMarkers(context);
  const jplPolicy = context.policy ?? context.policies ?? transaction.policy ?? transaction.policies;
  let policyResult = null;

  if (jplPolicy) {
    policyResult = evaluatePolicy(jplPolicy, { ...transaction, ...context });
  }

  const isReject = policyResult?.decision === 'REJECT';
  const isApproval = markersResult.requireApproval || policyResult?.decision === 'REQUIRE_APPROVAL';

  return {
    requireApproval: isApproval,
    decision: isReject ? 'REJECT' : (isApproval ? 'REQUIRE_APPROVAL' : 'PASS'),
    code: isReject ? policyResult.reason_code : undefined,
    reason_code: policyResult?.reason_code,
    markers: markersResult.markers,
    policy: policyResult,
  };
}

/**
 * Tahap C: AI Intent Check (PRD 2.0 §5.2 F1-7).
 * Aturan Emas: AI HANYA boleh memperketat (APPROVE -> REQUIRE_APPROVAL/REJECT).
 * AI TIDAK PERNAH boleh memperlonggar (REJECT -> APPROVE/REQUIRE_APPROVAL).
 * @param {object} context
 * @param {string} [priorDecision='AUTO_APPROVE']
 * @returns {{ decision: string, reason_codes: string[] }}
 */
export function checkAIIntent(context = {}, priorDecision = 'AUTO_APPROVE') {
  const aiDecision = context.decision || context.ai_decision || context.ai?.decision || 'AUTO_APPROVE';
  const aiReasons = context.reason_codes || context.reasonCodes || context.ai_reason_codes || context.ai?.reason_codes || [];

  // Peringkat keketatan: REJECT (2) > REQUIRE_APPROVAL (1) > AUTO_APPROVE / APPROVE (0)
  const rank = {
    REJECT: 2,
    REQUIRE_APPROVAL: 1,
    AUTO_APPROVE: 0,
    APPROVE: 0,
  };

  const priorRank = rank[priorDecision] ?? 0;
  const aiRank = rank[aiDecision] ?? 0;

  // AI hanya boleh memperketat
  const finalRank = Math.max(priorRank, aiRank);
  let effectiveDecision = priorDecision;
  if (finalRank === 2) {
    effectiveDecision = 'REJECT';
  } else if (finalRank === 1) {
    effectiveDecision = 'REQUIRE_APPROVAL';
  } else {
    effectiveDecision = 'APPROVE';
  }

  return {
    decision: effectiveDecision,
    reason_codes: aiReasons,
  };
}

/**
 * Tahap D: Final Decision Synthesis (PRD 2.0 §5.2 F1-8).
 * Menghasilkan keputusan akhir dan state agregat.
 * @param {object} tahapA
 * @param {object} tahapB
 * @param {object} tahapC
 * @returns {{ decision: string, state: string, reason_codes: string[] }}
 */
export function finalDecision(tahapA, tahapB, tahapC) {
  const reason_codes = [];

  // 1. Jika Tahap A gagal (REJECTED)
  if (tahapA?.decision === 'REJECT') {
    if (tahapA.code) reason_codes.push(tahapA.code);
    if (tahapA.reason_codes) reason_codes.push(...tahapA.reason_codes);
    return {
      decision: 'REJECT',
      state: 'REJECTED',
      reason_codes: [...new Set(reason_codes)],
    };
  }

  // 2. Jika Tahap A eskalasi (REQUIRE_APPROVAL)
  let currentDecision = 'APPROVE';
  if (tahapA?.decision === 'REQUIRE_APPROVAL') {
    currentDecision = 'REQUIRE_APPROVAL';
    if (tahapA.code) reason_codes.push(tahapA.code);
    if (tahapA.reason_codes) reason_codes.push(...tahapA.reason_codes);
  }

  // 3. Evaluasi Tahap B (Markers & JPL Policy)
  if (tahapB?.decision === 'REJECT') {
    if (tahapB.code) reason_codes.push(tahapB.code);
    if (tahapB.reason_code && tahapB.reason_code !== tahapB.code) reason_codes.push(tahapB.reason_code);
    return {
      decision: 'REJECT',
      state: 'REJECTED',
      reason_codes: [...new Set(reason_codes)],
    };
  }

  if (tahapB?.requireApproval || tahapB?.decision === 'REQUIRE_APPROVAL') {
    currentDecision = 'REQUIRE_APPROVAL';
    if (tahapB.markers?.length) reason_codes.push(...tahapB.markers);
    if (tahapB.code) reason_codes.push(tahapB.code);
    if (tahapB.reason_code && tahapB.reason_code !== tahapB.code) reason_codes.push(tahapB.reason_code);
  }

  // 4. Evaluasi Tahap C (AI Intent)
  if (tahapC) {
    const aiResult = checkAIIntent(tahapC, currentDecision);
    currentDecision = aiResult.decision;
    if (aiResult.reason_codes?.length) reason_codes.push(...aiResult.reason_codes);
  }

  let finalState = 'APPROVED';
  if (currentDecision === 'REJECT') {
    finalState = 'REJECTED';
  } else if (currentDecision === 'REQUIRE_APPROVAL') {
    finalState = 'NEEDS_APPROVAL';
  }

  return {
    decision: currentDecision,
    state: finalState,
    reason_codes: [...new Set(reason_codes)],
  };
}

/**
 * Evaluasi menyeluruh Tahap A1 s/d D untuk transaksi.
 * @param {string} orgId
 * @param {object} transaction
 * @param {object} [context={}]
 * @param {object} [dbClient=null]
 * @returns {Promise<{ decision: string, state: string, reason_codes: string[], tahapA: object, tahapB: object, tahapC: object }>}
 */
export async function evaluateUnifiedDecision(orgId, transaction, context = {}, dbClient = null) {
  // --- Tahap A1: vLEI ---
  const vleiActive = await hasActiveVlei(orgId, dbClient);
  if (!vleiActive && transaction.require_vlei !== false) {
    const tahapA = { decision: 'REJECT', code: 'VLEI_INACTIVE' };
    const res = finalDecision(tahapA, null, null);
    return { ...res, tahapA, tahapB: null, tahapC: null };
  }

  // --- Tahap A2: Intent ---
  const intentId = transaction.intent_mandate_id || context.intent_mandate_id;
  const shouldValidateIntent = transaction.require_intent ?? Boolean(intentId);
  if (shouldValidateIntent) {
    const intentRes = await validateIntentMatch(orgId, intentId, transaction, dbClient);
    if (!intentRes.valid) {
      const tahapA = { decision: 'REJECT', code: intentRes.code };
      const res = finalDecision(tahapA, null, null);
      return { ...res, tahapA, tahapB: null, tahapC: null };
    }
  }

  // --- Tahap A3: DIP ---
  const dip = await computeDIP(orgId, transaction, dbClient);
  if (dip.decision === 'REJECT') {
    const tahapA = { decision: 'REJECT', code: dip.code, dis_score: dip.score };
    const res = finalDecision(tahapA, null, null);
    return { ...res, tahapA, tahapB: null, tahapC: null };
  }
  if (dip.decision === 'REQUIRE_APPROVAL') {
    const tahapA = { decision: 'REQUIRE_APPROVAL', code: dip.code, dis_score: dip.score };
    const tahapB = evaluateStageB(transaction, context);
    if (tahapB.decision === 'REJECT') {
      const res = finalDecision(tahapA, tahapB, null);
      return { ...res, tahapA, tahapB, tahapC: null };
    }
    const tahapC = context.ai ? checkAIIntent(context.ai, 'REQUIRE_APPROVAL') : null;
    const res = finalDecision(tahapA, tahapB, tahapC);
    return { ...res, tahapA, tahapB, tahapC };
  }

  // --- Tahap A4: CPL (Hanya jika DIP >= 80) ---
  const cpl = await computeCPL(orgId, transaction, dbClient);
  if (cpl.decision === 'REJECT') {
    const tahapA = { decision: 'REJECT', code: cpl.code, rs_score: cpl.score };
    const res = finalDecision(tahapA, null, null);
    return { ...res, tahapA, tahapB: null, tahapC: null };
  }
  if (cpl.decision === 'REQUIRE_APPROVAL') {
    const tahapA = { decision: 'REQUIRE_APPROVAL', code: cpl.code, rs_score: cpl.score };
    const tahapB = evaluateStageB(transaction, context);
    if (tahapB.decision === 'REJECT') {
      const res = finalDecision(tahapA, tahapB, null);
      return { ...res, tahapA, tahapB, tahapC: null };
    }
    const tahapC = context.ai ? checkAIIntent(context.ai, 'REQUIRE_APPROVAL') : null;
    const res = finalDecision(tahapA, tahapB, tahapC);
    return { ...res, tahapA, tahapB, tahapC };
  }

  // --- Tahap A Lolos Penuh ---
  const tahapA = { decision: 'PASS' };

  // --- Tahap B: Markers & JPL Policy ---
  const tahapB = evaluateStageB(transaction, context);
  if (tahapB.decision === 'REJECT') {
    const res = finalDecision(tahapA, tahapB, null);
    return { ...res, tahapA, tahapB, tahapC: null };
  }

  // --- Tahap C: AI Intent ---
  const prior = tahapB.requireApproval ? 'REQUIRE_APPROVAL' : 'AUTO_APPROVE';
  const tahapC = context.ai ? checkAIIntent(context.ai, prior) : null;

  // --- Tahap D: Final Decision ---
  const res = finalDecision(tahapA, tahapB, tahapC);
  const isShadow = Boolean(transaction?.shadow_mode ?? context?.shadow_mode);
  if (isShadow) {
    if (res.decision === 'APPROVE') {
      return {
        ...res,
        decision: 'APPROVE',
        state: 'SHADOW_COMPLETED',
        shadow_mode: true,
        is_shadow: true,
        reason_codes: [...res.reason_codes, 'SHADOW_MODE_EVALUATED'],
        tahapA,
        tahapB,
        tahapC,
      };
    }
    return {
      ...res,
      shadow_mode: true,
      is_shadow: true,
      tahapA,
      tahapB,
      tahapC,
    };
  }

  return {
    ...res,
    tahapA,
    tahapB,
    tahapC,
  };
}
