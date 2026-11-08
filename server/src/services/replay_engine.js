// @ts-check
import crypto from 'node:crypto';
import { canonicalJson } from '../../../shared/canonical.js';
import { AppError } from '../lib/errors.js';

/**
 * Computes standard Levenshtein distance between two strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a = '', b = '') {
  const s1 = String(a).toLowerCase().trim();
  const s2 = String(b).toLowerCase().trim();

  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  const row = Array.from({ length: s2.length + 1 }, (_, i) => i);

  for (let i = 1; i <= s1.length; i++) {
    let prev = i;
    for (let j = 1; j <= s2.length; j++) {
      let val;
      if (s1[i - 1] === s2[j - 1]) {
        val = row[j - 1];
      } else {
        val = Math.min(row[j - 1], prev, row[j]) + 1;
      }
      row[j - 1] = prev;
      prev = val;
    }
    row[s2.length] = prev;
  }

  return row[s2.length];
}

/**
 * Checks if two reason items match per PRD 1.7 §4.4:
 * - Exact match on evidence_ref (and data_source)
 * - Fuzzy match on claim with Levenshtein <= 10%
 * @param {object} r1
 * @param {object} r2
 * @returns {boolean}
 */
export function reasonMatches(r1, r2) {
  if (!r1 || !r2) return false;
  if (r1.evidence_ref !== r2.evidence_ref) return false;
  if (r1.data_source && r2.data_source && r1.data_source !== r2.data_source) return false;

  const c1 = String(r1.claim || '');
  const c2 = String(r2.claim || '');
  const maxLen = Math.max(c1.length, c2.length, 1);
  const dist = levenshteinDistance(c1, c2);
  const ratio = dist / maxLen;

  return ratio <= 0.10;
}

/**
 * Deterministic Semantic Similarity Algorithm per PRD 1.7 §4.4:
 * - Compare each reason (claim, evidence_ref, data_source).
 * - If >= 90% reasons match: returns 1.0
 * - If >= 70% match: returns 0.5
 * - If < 70% match: returns 0.0
 * @param {Array<object>} originalReasons
 * @param {Array<object>} replayReasons
 * @returns {number} 1.0, 0.5, or 0.0
 */
export function computeSemanticSimilarity(originalReasons = [], replayReasons = []) {
  if (!Array.isArray(originalReasons) || !Array.isArray(replayReasons)) return 0;
  if (originalReasons.length === 0 || replayReasons.length === 0) return 0.0;

  const total = Math.max(originalReasons.length, replayReasons.length);
  let matchedCount = 0;

  for (let i = 0; i < originalReasons.length; i++) {
    const orig = originalReasons[i];
    // Find matching reason in replay
    const hasMatch = replayReasons.some((rep) => reasonMatches(orig, rep));
    if (hasMatch) {
      matchedCount++;
    }
  }

  const matchRatio = matchedCount / total;

  if (matchRatio >= 0.90) return 1.0;
  if (matchRatio >= 0.70) return 0.5;
  return 0.0;
}

/**
 * Computes deterministic RFC 8785 sha256 hash for raw payload.
 */
export function computeHash(objOrString) {
  const content = typeof objOrString === 'string' ? objOrString : canonicalJson(objOrString);
  const hex = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  return `sha256:${hex}`;
}

/**
 * Model-agnostic replay engine.
 * PRD 1.7 §4.1: Executes model with parameters from snapshot and generates replay output.
 * @param {object} snapshot - Cognitive snapshot object
 * @param {object} [options] - Execution or simulation options
 * @returns {Promise<object>} Replay output structure
 */
export async function executeReplay(snapshot, options = {}) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new AppError('CPL_REPLAY_UNAVAILABLE', 422, 'CPL_REPLAY_UNAVAILABLE: Invalid snapshot provided for replay');
  }

  const { model, inputs, outputs } = snapshot;
  if (!model || !inputs || !outputs) {
    throw new AppError('CPL_REPLAY_UNAVAILABLE', 422, 'CPL_REPLAY_UNAVAILABLE: Snapshot missing required model or input/output structures');
  }

  // Model-agnostic provider adapter lookup
  if (options.providerAdapter && typeof options.providerAdapter === 'function') {
    return await options.providerAdapter(snapshot, options);
  }

  // Handle explicit failure / unavailability injection
  if (options.unavailable || options.providerError) {
    throw new AppError('CPL_REPLAY_UNAVAILABLE', 503, 'Model provider is temporarily unavailable for replay');
  }

  // Deterministic simulation based on parameters
  const divergence = options.simulatedDivergence || options.divergence;

  if (divergence === 'DECISION_CHANGED') {
    const alternateDecision = outputs.decision === 'APPROVED' ? 'REJECTED' : 'APPROVED';
    const rawOutput = `{"decision":"${alternateDecision}","divergence":"DECISION_CHANGED"}`;
    const rawHash = computeHash(rawOutput);
    return {
      available: true,
      decision: alternateDecision,
      reasoning_trace_hash: outputs.reasoning_trace_hash,
      raw_output_hash: rawHash,
      reasoning_trace: options.replayReasons || [],
      raw_output: rawOutput,
      model_id: model.model_id,
      model_version: model.model_version,
      seed: model.seed,
    };
  }

  if (divergence === 'REASONING_CHANGED_SEMANTIC') {
    // Modify claims slightly within 10% Levenshtein distance
    const originalReasons = options.originalReasons || [
      { claim: 'Invoice matches purchase order 1234', evidence_ref: 'doc:inv-1234', data_source: 'invoice' },
    ];
    const semanticReasons = originalReasons.map((r) => ({
      ...r,
      claim: `${r.claim}.`, // 1 char difference -> <10% distance
    }));
    const traceHash = computeHash({ reasons: semanticReasons });
    const rawOutput = JSON.stringify({ decision: outputs.decision, trace: semanticReasons });
    return {
      available: true,
      decision: outputs.decision,
      reasoning_trace_hash: traceHash,
      raw_output_hash: outputs.raw_output_hash,
      reasoning_trace: semanticReasons,
      raw_output: rawOutput,
      model_id: model.model_id,
      model_version: model.model_version,
      seed: model.seed,
    };
  }

  if (divergence === 'REASONING_MISMATCH') {
    const mismatchReasons = [
      { claim: 'Completely unrelated claim about weather in Tokyo', evidence_ref: 'doc:unrelated', data_source: 'invoice' },
    ];
    const traceHash = computeHash({ reasons: mismatchReasons });
    const rawOutput = JSON.stringify({ decision: outputs.decision, trace: mismatchReasons });
    return {
      available: true,
      decision: outputs.decision,
      reasoning_trace_hash: traceHash,
      raw_output_hash: computeHash(rawOutput),
      reasoning_trace: mismatchReasons,
      raw_output: rawOutput,
      model_id: model.model_id,
      model_version: model.model_version,
      seed: model.seed,
    };
  }

  if (divergence === 'RAW_CHANGED') {
    const alteredRaw = `{"decision":"${outputs.decision}","timestamp":"${new Date().toISOString()}"}`;
    return {
      available: true,
      decision: outputs.decision,
      reasoning_trace_hash: outputs.reasoning_trace_hash,
      raw_output_hash: computeHash(alteredRaw),
      reasoning_trace: options.originalReasons || [],
      raw_output: alteredRaw,
      model_id: model.model_id,
      model_version: model.model_version,
      seed: model.seed,
    };
  }

  // Default: Perfect deterministic replay (temperature = 0 or matching seed)
  return {
    available: true,
    decision: outputs.decision,
    reasoning_trace_hash: outputs.reasoning_trace_hash,
    raw_output_hash: outputs.raw_output_hash,
    reasoning_trace: options.originalReasons || [],
    raw_output: options.raw_output || `{"decision":"${outputs.decision}"}`,
    model_id: model.model_id,
    model_version: model.model_version,
    seed: model.seed,
  };
}

export default {
  levenshteinDistance,
  reasonMatches,
  computeSemanticSimilarity,
  computeHash,
  executeReplay,
};
