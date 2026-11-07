// @ts-check
import crypto from 'node:crypto';
import { query } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { parseReasoningTrace } from './reasoning_parser.js';

/**
 * Valid purpose to category mapping per PRD 1.6 §5.2.
 */
export const PURPOSE_TO_CATEGORIES = {
  equipment_purchase: ['SALE', 'PAYOUT', 'DOWN_PAYMENT'],
  software_subscription: ['RECURRING', 'PAYOUT'],
  service_payment: ['PAYOUT', 'INVOICE'],
  supplier_payout: ['PAYOUT'],
  refund_issuance: ['REFUND'],
  invoice_payment: ['INVOICE', 'PAYOUT'],
  down_payment: ['DOWN_PAYMENT'],
  other: [
    'SALE', 'DOWN_PAYMENT', 'INVOICE', 'PAYOUT', 'REFUND', 'VOID',
    'DISPUTE', 'PARTIAL', 'SCHEDULED', 'RECURRING', 'BULK', 'SPLIT',
    'TRANSFER', 'FINANCING', 'DEBIT'
  ],
};

/**
 * Weights per PRD 1.6 §5.1 / §5.7.
 */
export const DIP_WEIGHTS = {
  w_purpose: 0.15,
  w_amount: 0.15,
  w_vendor: 0.20,
  w_brand: 0.10,
  w_attributes: 0.20,
  w_evidence: 0.20,
};

function normalize(str) {
  return String(str || '').trim().toLowerCase();
}

/**
 * Evaluates C_purpose (0 or 1).
 */
export function evaluatePurpose(intentPurpose, requestCategory) {
  if (!intentPurpose || !requestCategory) return 0;
  const normalizedPurpose = normalize(intentPurpose);
  const normalizedCategory = String(requestCategory).trim().toUpperCase();

  const validCategories = PURPOSE_TO_CATEGORIES[normalizedPurpose];
  if (!validCategories) return 0;
  return validCategories.includes(normalizedCategory) ? 1 : 0;
}

/**
 * Evaluates C_amount (0, 0.5, or 1).
 * Range tolerance 10% per PRD 1.6 §5.3.
 */
export function evaluateAmount(amountRange, requestAmountMinor) {
  if (!amountRange || requestAmountMinor === undefined || requestAmountMinor === null) {
    return 0;
  }

  let amount;
  let min;
  let max;

  try {
    amount = BigInt(requestAmountMinor);
    min = BigInt(amountRange.min ?? 0);
    max = BigInt(amountRange.max ?? 0);
  } catch {
    return 0;
  }

  if (amount >= min && amount <= max) {
    return 1;
  }

  // 10% tolerance: min * 0.9 <= amount <= max * 1.1
  const minTolerance = (min * 90n) / 100n;
  const maxTolerance = (max * 110n) / 100n;

  if (amount >= minTolerance && amount <= maxTolerance) {
    return 0.5;
  }

  return 0;
}

/**
 * Evaluates C_vendor (0, 0.5, or 1).
 * 0.5 if vendor category is missing/unspecified per PRD 1.6 §5.4.
 */
export function evaluateVendor(vendorCategories, counterpartyCategory) {
  if (!Array.isArray(vendorCategories) || vendorCategories.length === 0) {
    return 1; // no constraint
  }

  if (!counterpartyCategory) {
    return 0.5; // neutral for unclassified / new vendor
  }

  const normalizedAllowed = vendorCategories.map(normalize);
  const normalizedTarget = normalize(counterpartyCategory);

  return normalizedAllowed.includes(normalizedTarget) ? 1 : 0;
}

/**
 * Evaluates C_brand (0, 0.5, or 1).
 * 0.5 if allowed_brands is empty per PRD 1.6 §5.7.
 */
export function evaluateBrand(allowedBrands, extractedBrand) {
  if (!Array.isArray(allowedBrands) || allowedBrands.length === 0) {
    return 0.5;
  }

  if (!extractedBrand) {
    return 0;
  }

  const normalizedAllowed = allowedBrands.map(normalize);
  const normalizedTarget = normalize(extractedBrand);

  return normalizedAllowed.includes(normalizedTarget) ? 1 : 0;
}

/**
 * Evaluates attribute operator satisfaction.
 */
export function evaluateAttributeOperator(operator, extractedValue, expectedValue) {
  if (extractedValue === undefined || extractedValue === null) {
    return false;
  }

  switch (operator) {
    case 'eq':
      return String(extractedValue) === String(expectedValue);
    case 'neq':
      return String(extractedValue) !== String(expectedValue);
    case 'gte':
      return Number(extractedValue) >= Number(expectedValue);
    case 'lte':
      return Number(extractedValue) <= Number(expectedValue);
    case 'in':
      return Array.isArray(expectedValue) && expectedValue.map(String).includes(String(extractedValue));
    case 'not_in':
      return Array.isArray(expectedValue) && !expectedValue.map(String).includes(String(extractedValue));
    case 'contains':
      return String(extractedValue).toLowerCase().includes(String(expectedValue).toLowerCase());
    default:
      return false;
  }
}

/**
 * Evaluates C_attributes (0..1).
 */
export function evaluateAttributes(requiredAttributes, combinedExtractedAttributes) {
  if (!Array.isArray(requiredAttributes) || requiredAttributes.length === 0) {
    return 1;
  }

  let passedCount = 0;
  for (const attr of requiredAttributes) {
    const extractedVal = combinedExtractedAttributes?.[attr.key];
    if (evaluateAttributeOperator(attr.operator, extractedVal, attr.value)) {
      passedCount++;
    }
  }

  return passedCount / requiredAttributes.length;
}

/**
 * Helper to get a nested property by dot path (e.g. 'request.amount_minor').
 */
function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let curr = obj;
  for (const part of parts) {
    if (curr === undefined || curr === null) return undefined;
    curr = curr[part];
  }
  return curr;
}

/**
 * Evaluates C_evidence (0..1).
 */
export async function evaluateEvidence(reasons, context, dbClient = null) {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    return 0;
  }

  let totalScore = 0;

  for (const reason of reasons) {
    const { evidence_ref, extracted_attributes } = reason;
    if (!evidence_ref || typeof evidence_ref !== 'string') {
      continue;
    }

    const colonIdx = evidence_ref.indexOf(':');
    if (colonIdx === -1) {
      continue;
    }

    const prefix = evidence_ref.slice(0, colonIdx);
    const identifier = evidence_ref.slice(colonIdx + 1);

    let isValidRef = false;
    let isConsistent = true;

    if (prefix === 'field') {
      // Look up field in transaction / request / context
      // Support path prefixes: "request.", "transaction.", "tx.", "context."
      const cleanIdentifier = identifier.replace(/^(request|transaction|tx|context)\./, '');
      const directVal = getByPath(context.transaction, cleanIdentifier) ??
                        getByPath(context.transaction, identifier) ??
                        getByPath(context.intentAnchor, cleanIdentifier) ??
                        getByPath(context.intentAnchor, identifier) ??
                        getByPath(context, cleanIdentifier) ??
                        getByPath(context, identifier);

      if (directVal !== undefined) {
        isValidRef = true;
        // Verify consistency if extracted_attributes exists
        if (extracted_attributes && Object.keys(extracted_attributes).length > 0) {
          for (const [k, v] of Object.entries(extracted_attributes)) {
            const actualVal = context.transaction?.[k] ?? context.transaction?.metadata?.[k];
            if (actualVal !== undefined && String(actualVal) !== String(v)) {
              isConsistent = false;
            }
          }
        }
      }
    } else if (prefix === 'doc') {
      // Check document existence and injection flags
      const runner = dbClient || query;
      let docRows = [];

      try {
        if (typeof runner === 'function') {
          const res = await runner(
            `SELECT id, injection_flags, filename, mime, status
             FROM documents
             WHERE org_id = $1 AND (id::text = $2 OR filename = $2 OR filename ILIKE '%' || $2 || '%')`,
            [context.orgId, identifier]
          );
          docRows = res.rows || [];
        }
      } catch {
        // DB error or offline testing fallback
      }

      // Context document fallback for mock tests
      const ctxDoc = context.documents?.find?.(
        (d) => d.id === identifier || d.filename === identifier || String(d.id).includes(identifier)
      );

      const doc = docRows[0] || ctxDoc;
      if (doc) {
        isValidRef = true;
        // Check for prompt injection flags or hidden instructions
        const flags = Array.isArray(doc.injection_flags)
          ? doc.injection_flags
          : (typeof doc.injection_flags === 'string' ? JSON.parse(doc.injection_flags || '[]') : []);

        if (flags.length > 0 || doc.has_injection === true || doc.content?.includes?.('ignore previous instructions')) {
          isValidRef = false; // Prompt injection / adversarial document
        }

        // Verify consistency with document extraction
        if (isValidRef && doc.extractions) {
          for (const [k, v] of Object.entries(extracted_attributes || {})) {
            if (doc.extractions[k] !== undefined && String(doc.extractions[k]) !== String(v)) {
              isConsistent = false;
            }
          }
        }
      }
    } else if (prefix === 'record') {
      // Valid record format check
      if (identifier && identifier.length >= 3) {
        isValidRef = true;
      }
    }

    if (isValidRef) {
      if (!isConsistent) {
        // Evidence ref exists but extracted attributes conflict with ground truth
        totalScore += 0;
      } else if (extracted_attributes && Object.keys(extracted_attributes).length > 0) {
        totalScore += 1.0;
      } else {
        totalScore += 0.5;
      }
    } else {
      totalScore += 0;
    }
  }

  return totalScore / reasons.length;
}

/**
 * Computes Decision Integrity Score (DIS) per PRD 1.6 §5.
 * 
 * @param {object} params
 * @param {string} params.orgId - Organization UUID
 * @param {object} params.transaction - Transaction intent or proposed request
 * @param {object} params.intentAnchor - Human-signed Intent Anchor (or mandate)
 * @param {object} params.reasoningTrace - Reasoning Trace object
 * @param {object} [params.dbClient=null] - Optional DB client
 * @param {Array<object>} [params.documents=[]] - Optional pre-loaded documents for tests
 * @returns {Promise<{
 *   score: number,
 *   components: {
 *     purpose: number,
 *     amount: number,
 *     vendor: number,
 *     brand: number,
 *     attributes: number,
 *     evidence: number
 *   },
 *   hard_rule_triggered: string|null,
 *   decision: 'AUTO_APPROVE'|'REQUIRE_APPROVAL'|'REJECTED',
 *   intent_hash: string,
 *   trace_hash: string
 * }>}
 */
export async function computeDecisionIntegrityScore({
  orgId,
  transaction,
  intentAnchor,
  reasoningTrace,
  dbClient = null,
  documents = [],
}) {
  if (!intentAnchor || !reasoningTrace) {
    return {
      score: 0,
      components: { purpose: 0, amount: 0, vendor: 0, brand: 0, attributes: 0, evidence: 0 },
      hard_rule_triggered: 'DIP_INDETERMINATE',
      decision: 'REQUIRE_APPROVAL',
      intent_hash: intentAnchor?.intent_hash || '',
      trace_hash: reasoningTrace?.trace_hash || '',
    };
  }

  // Parse and validate Reasoning Trace
  let trace;
  try {
    trace = parseReasoningTrace(reasoningTrace, transaction?.intent_id || transaction?.id);
  } catch (err) {
    return {
      score: 0,
      components: { purpose: 0, amount: 0, vendor: 0, brand: 0, attributes: 0, evidence: 0 },
      hard_rule_triggered: 'DIP_EVIDENCE_INVALID',
      decision: 'REJECTED',
      intent_hash: intentAnchor?.intent_hash || '',
      trace_hash: '',
    };
  }

  const structured = intentAnchor.structured_intent_v2 || intentAnchor.structured_intent || {};
  const constraints = structured.constraints || {};
  const allowedBrands = constraints.allowed_brands || [];
  const requiredAttributes = constraints.required_attributes || [];

  // Combine extracted attributes across all reasons
  const combinedExtracted = {};
  let extractedBrand = null;

  for (const reason of trace.reasons) {
    if (reason.extracted_attributes) {
      Object.assign(combinedExtracted, reason.extracted_attributes);
      if (reason.extracted_attributes.brand) {
        extractedBrand = reason.extracted_attributes.brand;
      }
    }
  }

  // Verified ground truth from documents extractions overrides unverified agent claims
  if (Array.isArray(documents)) {
    for (const doc of documents) {
      if (doc?.extractions) {
        Object.assign(combinedExtracted, doc.extractions);
      }
    }
  }

  // Verified ground truth from transaction metadata overrides unverified agent claims
  if (transaction?.metadata && typeof transaction.metadata === 'object') {
    for (const [k, v] of Object.entries(transaction.metadata)) {
      if (v !== undefined && v !== null && k !== 'brand') {
        combinedExtracted[k] = v;
      }
    }
  }

  if (!extractedBrand) {
    extractedBrand = transaction?.metadata?.brand || transaction?.brand;
  }

  // 1. C_purpose
  const category = transaction.category || transaction.metadata?.category;
  const C_purpose = evaluatePurpose(structured.purpose, category);

  // 2. C_amount
  const amountMinor = transaction.amount_minor ?? transaction.amountMinor ?? transaction.amount;
  const C_amount = evaluateAmount(constraints.amount_range, amountMinor);

  // 3. C_vendor
  const counterpartyCategory =
    transaction.counterparty?.category ||
    transaction.counterpartyCategory ||
    transaction.vendor_category ||
    transaction.vendorCategory ||
    transaction.metadata?.vendor_category ||
    transaction.metadata?.counterparty_category;
  const C_vendor = evaluateVendor(constraints.vendor_categories, counterpartyCategory);

  // 4. C_brand
  const C_brand = evaluateBrand(allowedBrands, extractedBrand);

  // 5. C_attributes
  const C_attributes = evaluateAttributes(requiredAttributes, combinedExtracted);

  // 6. C_evidence
  const C_evidence = await evaluateEvidence(
    trace.reasons,
    { orgId, transaction, intentAnchor, documents },
    dbClient
  );

  // Check PII violation
  if (trace.pii_detected === true) {
    return {
      score: 0,
      components: {
        purpose: C_purpose,
        amount: C_amount,
        vendor: C_vendor,
        brand: C_brand,
        attributes: C_attributes,
        evidence: 0,
      },
      hard_rule_triggered: 'DIP_EVIDENCE_INVALID',
      decision: 'REJECTED',
      intent_hash: intentAnchor.intent_hash || intentAnchor.intent_hash_v2 || '',
      trace_hash: trace.trace_hash,
    };
  }

  // Calculate raw DIS score
  const { w_purpose, w_amount, w_vendor, w_brand, w_attributes, w_evidence } = DIP_WEIGHTS;
  const rawScore = 100 * (
    w_purpose * C_purpose +
    w_amount * C_amount +
    w_vendor * C_vendor +
    w_brand * C_brand +
    w_attributes * C_attributes +
    w_evidence * C_evidence
  );

  const score = Math.round(rawScore);

  // Hard Rules Evaluation (overrides DIS score)
  let hardRuleTriggered = null;
  let decision = 'AUTO_APPROVE';

  if (C_evidence < 0.5) {
    hardRuleTriggered = 'DIP_EVIDENCE_INVALID';
    decision = 'REJECTED';
  } else if (C_brand === 0 && allowedBrands.length > 0) {
    hardRuleTriggered = 'DIP_BRAND_MISMATCH';
    decision = 'REQUIRE_APPROVAL';
  } else if (C_attributes < 0.5) {
    hardRuleTriggered = 'DIP_ATTRIBUTES_MISMATCH';
    decision = 'REQUIRE_APPROVAL';
  } else {
    // Thresholds when no hard rule triggered
    if (score >= 80) {
      decision = 'AUTO_APPROVE';
      hardRuleTriggered = null;
    } else if (score >= 50) {
      decision = 'REQUIRE_APPROVAL';
      hardRuleTriggered = 'DIP_LOW_SCORE';
    } else {
      decision = 'REJECTED';
      hardRuleTriggered = 'DIP_CRITICAL';
    }
  }

  return {
    score,
    components: {
      purpose: C_purpose,
      amount: C_amount,
      vendor: C_vendor,
      brand: C_brand,
      attributes: C_attributes,
      evidence: C_evidence,
    },
    hard_rule_triggered: hardRuleTriggered,
    decision,
    intent_hash: intentAnchor.intent_hash || intentAnchor.intent_hash_v2 || '',
    trace_hash: trace.trace_hash,
  };
}

/**
 * Persists Reasoning Trace to database.
 */
export async function storeReasoningTrace({ orgId, requestId, trace, dbClient = null }) {
  if (!orgId || !requestId || !trace) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId, requestId, and trace are required');
  }

  const parsed = parseReasoningTrace(trace, requestId);
  const runner = dbClient || query;

  const sql = `
    INSERT INTO reasoning_traces (
      trace_id, request_id, org_id, reasons, trace_hash
    ) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (request_id) DO UPDATE SET
      reasons = EXCLUDED.reasons,
      trace_hash = EXCLUDED.trace_hash,
      created_at = now()
    RETURNING trace_id, request_id, org_id, reasons, trace_hash, created_at;
  `;

  const { rows } = await runner(sql, [
    crypto.randomUUID(),
    requestId,
    orgId,
    JSON.stringify(parsed.reasons),
    parsed.trace_hash,
  ]);

  return rows[0];
}

/**
 * Retrieves Reasoning Trace for a request.
 */
export async function getReasoningTrace(orgId, requestId, dbClient = null) {
  const runner = dbClient || query;
  const sql = `
    SELECT trace_id, request_id, org_id, reasons, trace_hash, created_at
    FROM reasoning_traces
    WHERE org_id = $1 AND request_id = $2;
  `;
  const { rows } = await runner(sql, [orgId, requestId]);
  return rows[0] || null;
}

/**
 * Persists Decision Integrity Score to database.
 */
export async function storeDecisionIntegrityScore({ orgId, requestId, dipResult, dbClient = null }) {
  if (!orgId || !requestId || !dipResult) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId, requestId, and dipResult are required');
  }

  const runner = dbClient || query;
  const sql = `
    INSERT INTO decision_integrity_scores (
      dis_id, request_id, org_id, score, components, hard_rule_triggered, decision
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (request_id) DO UPDATE SET
      score = EXCLUDED.score,
      components = EXCLUDED.components,
      hard_rule_triggered = EXCLUDED.hard_rule_triggered,
      decision = EXCLUDED.decision,
      computed_at = now()
    RETURNING dis_id, request_id, org_id, score, components, hard_rule_triggered, decision, computed_at;
  `;

  const { rows } = await runner(sql, [
    crypto.randomUUID(),
    requestId,
    orgId,
    dipResult.score,
    JSON.stringify(dipResult.components),
    dipResult.hard_rule_triggered,
    dipResult.decision,
  ]);

  return rows[0];
}

/**
 * Retrieves Decision Integrity Score for a request.
 */
export async function getDecisionIntegrityScore(orgId, requestId, dbClient = null) {
  const runner = dbClient || query;
  const sql = `
    SELECT dis_id, request_id, org_id, score, components, hard_rule_triggered, decision, computed_at
    FROM decision_integrity_scores
    WHERE org_id = $1 AND request_id = $2;
  `;
  const { rows } = await runner(sql, [orgId, requestId]);
  return rows[0] || null;
}
