// server/src/services/decision_engine_intent.js
// PRD 1.4 Trust Infrastructure (Fase B: Intent Layer) & PRD 1.6 (Decision Integrity Proof)
// Decision Engine Stage A integration for intent mandate verification & DIP consistency check

import { validateIntentMatch, getIntentMandate } from './intent_service.js';
import {
  computeDecisionIntegrityScore,
  getReasoningTrace,
  storeReasoningTrace,
  storeDecisionIntegrityScore,
} from './dip_service.js';

/**
 * Evaluates Stage A Intent Mandate and Decision Integrity Proof rules.
 * Invoked after MANDATE_INACTIVE/MANDATE_EXPIRED and before CATEGORY_NOT_ALLOWED.
 * 
 * @param {object} params
 * @param {string} params.orgId
 * @param {object} params.mandate
 * @param {object} params.transaction
 * @param {object} [params.dbClient]
 * @returns {Promise<{ valid: boolean, decision?: string, reason_codes?: string[], code?: string, dis_score?: number, dip?: object }>}
 */
export async function evaluateIntentMandateStageA({ orgId, mandate, transaction = {}, dbClient }) {
  const policy = mandate?.policy || mandate;
  const isIntentCheckEnabled = Boolean(
    mandate?.ai?.intentCheck ||
    mandate?.ai?.intent_check ||
    policy?.ai?.intentCheck ||
    policy?.ai?.intent_check ||
    transaction?.requireIntentCheck ||
    transaction?.intent_mandate_id ||
    transaction?.intentMandateId
  );

  if (!isIntentCheckEnabled) {
    return { valid: true };
  }

  const intentMandateId = transaction.intent_mandate_id || transaction.intentMandateId;
  if (!intentMandateId) {
    return {
      valid: false,
      decision: 'REJECT',
      reason_codes: ['INTENT_MANDATE_MISSING'],
      code: 'INTENT_MANDATE_MISSING',
    };
  }

  const result = await validateIntentMatch(orgId, intentMandateId, transaction, dbClient);
  if (!result.valid) {
    return {
      valid: false,
      decision: 'REJECT',
      reason_codes: [result.reason],
      code: result.reason,
    };
  }

  // PRD 1.6 Decision Integrity Proof (DIP) Enforcement
  const isDipRequired = Boolean(
    mandate?.require_dip ||
    policy?.require_dip ||
    transaction?.require_dip ||
    transaction?.reasoning_trace ||
    transaction?.reasoningTrace
  );

  if (!isDipRequired) {
    return { valid: true };
  }

  const requestId = transaction.intent_id || transaction.id;
  let trace = transaction.reasoning_trace || transaction.reasoningTrace;
  if (!trace && requestId) {
    trace = await getReasoningTrace(orgId, requestId, dbClient);
  }

  if (!trace) {
    return {
      valid: false,
      decision: 'REJECT',
      reason_codes: ['REASONING_TRACE_MISSING'],
      code: 'REASONING_TRACE_MISSING',
    };
  }

  let intentAnchor;
  try {
    intentAnchor = await getIntentMandate(orgId, intentMandateId, dbClient);
  } catch {
    return {
      valid: false,
      decision: 'REQUIRE_APPROVAL',
      reason_codes: ['DIP_INDETERMINATE'],
      code: 'DIP_INDETERMINATE',
    };
  }

  const dip = await computeDecisionIntegrityScore({
    orgId,
    transaction,
    intentAnchor,
    reasoningTrace: trace,
    dbClient,
  });

  // Persist score & trace
  if (requestId) {
    await storeReasoningTrace({ orgId, requestId, trace, dbClient }).catch(() => {});
    await storeDecisionIntegrityScore({ orgId, requestId, dipResult: dip, dbClient }).catch(() => {});
  }

  if (dip.hard_rule_triggered === 'DIP_EVIDENCE_INVALID') {
    return {
      valid: false,
      decision: 'REJECT',
      reason_codes: ['DIP_EVIDENCE_INVALID'],
      code: 'DIP_EVIDENCE_INVALID',
      dis_score: dip.score,
      dip,
    };
  }

  if (dip.hard_rule_triggered === 'DIP_BRAND_MISMATCH' ||
      dip.hard_rule_triggered === 'DIP_ATTRIBUTES_MISMATCH') {
    return {
      valid: false,
      decision: 'REQUIRE_APPROVAL',
      reason_codes: [dip.hard_rule_triggered],
      code: dip.hard_rule_triggered,
      dis_score: dip.score,
      dip,
    };
  }

  if (dip.score < 50) {
    return {
      valid: false,
      decision: 'REJECT',
      reason_codes: ['DIP_CRITICAL'],
      code: 'DIP_CRITICAL',
      dis_score: dip.score,
      dip,
    };
  }

  if (dip.score < 80) {
    return {
      valid: false,
      decision: 'REQUIRE_APPROVAL',
      reason_codes: ['DIP_LOW_SCORE'],
      code: 'DIP_LOW_SCORE',
      dis_score: dip.score,
      dip,
    };
  }

  return { valid: true, dis_score: dip.score, dip };
}
