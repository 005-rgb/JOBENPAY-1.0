// @ts-check
import crypto from 'node:crypto';
import { canonicalJson } from '../../../shared/canonical.js';
import { AppError } from '../lib/errors.js';
import { ReasonItemSchema } from '../../../shared/dip_schema.js';

// Regex for email
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
// Regex for phone numbers (E.164 or common formats: 10+ digits with separators)
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;
// Regex for Credit Card / SSN patterns
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/;

/**
 * Checks if a string contains Personally Identifiable Information (PII).
 * @param {string} text
 * @returns {boolean}
 */
export function containsPii(text) {
  if (!text || typeof text !== 'string') return false;
  return EMAIL_REGEX.test(text) || PHONE_REGEX.test(text) || SSN_REGEX.test(text);
}

/**
 * Validates and parses a Reasoning Trace according to PRD 1.6 §4.
 * 
 * Rules:
 * - Minimal 3 alasan. Jika < 3 -> VALIDATION_FAILED.
 * - Maksimal 5 alasan. Jika > 5 -> ambil 5 pertama.
 * - Format evidence_ref: ^(doc|field|record):[a-zA-Z0-9_.-]+$
 * - PII di claim -> tandai pii_detected = true.
 * 
 * @param {object} rawTrace
 * @param {string} [requestId]
 * @returns {{
 *   trace_id: string,
 *   request_id: string,
 *   reasons: Array<{
 *     claim: string,
 *     evidence_ref: string,
 *     data_source: string,
 *     extracted_attributes: Record<string, any>
 *   }>,
 *   trace_hash: string,
 *   pii_detected: boolean,
 *   created_at: string
 * }}
 */
export function parseReasoningTrace(rawTrace, requestId = null) {
  if (!rawTrace || typeof rawTrace !== 'object') {
    throw new AppError('VALIDATION_FAILED', 400, 'Reasoning trace payload must be an object');
  }

  const effectiveRequestId = requestId || rawTrace.request_id;
  if (!effectiveRequestId || typeof effectiveRequestId !== 'string') {
    throw new AppError('VALIDATION_FAILED', 400, 'request_id is required for reasoning trace');
  }

  let reasons = rawTrace.reasons;
  if (!Array.isArray(reasons)) {
    throw new AppError('VALIDATION_FAILED', 400, 'reasons must be an array');
  }

  if (reasons.length < 3) {
    throw new AppError('VALIDATION_FAILED', 400, 'Reasoning trace requires a minimum of 3 reasons');
  }

  // If more than 5 reasons, take the first 5
  if (reasons.length > 5) {
    reasons = reasons.slice(0, 5);
  }

  let piiDetected = false;
  const validatedReasons = reasons.map((item, index) => {
    const parseResult = ReasonItemSchema.safeParse(item);
    if (!parseResult.success) {
      const issueMsg = parseResult.error.issues?.[0]?.message || 'validation failed';
      throw new AppError('VALIDATION_FAILED', 400, `Invalid reason item at index ${index}: ${issueMsg}`, {
        errors: parseResult.error.flatten(),
      });
    }

    const reason = parseResult.data;
    if (containsPii(reason.claim)) {
      piiDetected = true;
    }

    return reason;
  });

  const traceId = rawTrace.trace_id || `rt_${crypto.randomUUID().replace(/-/g, '').slice(0, 26)}`;
  const createdAt = rawTrace.created_at || new Date().toISOString();

  // Canonicalize and hash RFC 8785
  const canonical = canonicalJson({
    request_id: effectiveRequestId,
    reasons: validatedReasons,
  });
  const hashHex = crypto.createHash('sha256').update(canonical).digest('hex');
  const traceHash = `sha256:${hashHex}`;

  return {
    trace_id: traceId,
    request_id: effectiveRequestId,
    reasons: validatedReasons,
    trace_hash: traceHash,
    pii_detected: piiDetected,
    created_at: createdAt,
  };
}
