// server/src/services/decision_engine_intent.js
// PRD 1.4 Trust Infrastructure (Fase B: Intent Layer, WP5)
// Decision Engine Stage A integration for intent mandate verification

import { validateIntentMatch } from './intent_service.js';

/**
 * Evaluates Stage A Intent Mandate rule.
 * Invoked after MANDATE_INACTIVE/MANDATE_EXPIRED and before CATEGORY_NOT_ALLOWED.
 * 
 * @param {object} params
 * @param {string} params.orgId
 * @param {object} params.mandate
 * @param {object} params.transaction
 * @param {object} [params.dbClient]
 * @returns {Promise<{ valid: boolean, decision?: string, reason_codes?: string[], code?: string }>}
 */
export async function evaluateIntentMandateStageA({ orgId, mandate, transaction = {}, dbClient }) {
  const policy = mandate?.policy || mandate;
  const isIntentCheckEnabled = Boolean(
    mandate?.ai?.intentCheck ||
    mandate?.ai?.intent_check ||
    policy?.ai?.intentCheck ||
    policy?.ai?.intent_check ||
    transaction?.requireIntentCheck
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

  return { valid: true };
}
