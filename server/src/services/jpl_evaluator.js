// @ts-check
import { compile } from './jpl_compiler.js';

/**
 * Evaluates a JPL policy against an input context deterministically.
 * PRD 1.8 §4.1, §4.2 & §6:
 * - Deterministic resolution
 * - Explicit deny precedence (DENY unconditionally wins)
 * - Fail-closed: errors resolve to DENY
 * @param {object|string} policyOrCompiled
 * @param {object} input
 * @returns {object} { outcome, rule_id, reason_code, outcome_params, evaluated_at }
 */
export function evaluate(policyOrCompiled, input = {}) {
  const evaluated_at = new Date().toISOString();

  try {
    const compiled = policyOrCompiled && Array.isArray(policyOrCompiled.rules) && typeof policyOrCompiled.rules[0]?.evaluate === 'function'
      ? policyOrCompiled
      : compile(policyOrCompiled);

    let firstCandidate = null;
    let denyMatch = null;

    for (let i = 0; i < compiled.rules.length; i++) {
      const rule = compiled.rules[i];
      let matched = false;

      try {
        matched = rule.evaluate(input);
      } catch {
        matched = false; // Fail-closed on rule evaluation error
      }

      if (matched) {
        if (rule.outcome === 'DENY') {
          denyMatch = rule;
          break; // Explicit Deny Precedence: DENY immediately overrides any rule
        }
        if (!firstCandidate) {
          firstCandidate = rule;
        }
      }
    }

    if (denyMatch) {
      return {
        outcome: 'DENY',
        rule_id: denyMatch.rule_id,
        reason_code: denyMatch.outcome_params?.reason_code || null,
        outcome_params: denyMatch.outcome_params || {},
        evaluated_at,
      };
    }

    if (firstCandidate) {
      return {
        outcome: firstCandidate.outcome,
        rule_id: firstCandidate.rule_id,
        reason_code: firstCandidate.outcome_params?.reason_code || null,
        outcome_params: firstCandidate.outcome_params || {},
        evaluated_at,
      };
    }

    return {
      outcome: compiled.default_outcome,
      rule_id: null,
      reason_code: null,
      outcome_params: {},
      evaluated_at,
    };
  } catch (err) {
    // Fail-closed fallback: PRD 1.8 §4.1
    return {
      outcome: 'DENY',
      rule_id: null,
      reason_code: 'EVALUATION_ERROR',
      outcome_params: { error: err.message },
      evaluated_at,
    };
  }
}
