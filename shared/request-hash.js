// @ts-check
import { canonicalJson } from './canonical.js';
import crypto from 'node:crypto';

/**
 * Hitung request_hash v2.
 * Menyertakan intent_mandate_id, reasoning_trace_hash, intent_anchor_id.
 * @param {object} request
 * @returns {string} sha256:<hex>
 */
export function computeRequestHashV2(request) {
  const payload = {
    orgId: request.org_id,
    agentId: request.agent_id,
    mandateVersionId: request.mandate_version_id,
    intentMandateId: request.intent_mandate_id || null,
    action: request.action,
    category: request.category,
    subType: request.sub_type,
    amountMinor: request.amount_minor.toString(),
    currency: request.currency,
    payeeId: request.payee_id || null,
    targetRef: request.target_ref || null,
    documentSha256: request.document_sha256 || null,
    reasoningTraceHash: request.reasoning_trace_hash || null,
    intentAnchorId: request.intent_anchor_id || null,
  };
  const canonical = canonicalJson(payload);
  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Hitung request_hash v1 (untuk backward compatibility).
 * @param {object} request
 * @returns {string} sha256:<hex>
 */
export function computeRequestHashV1(request) {
  const payload = {
    orgId: request.org_id,
    agentId: request.agent_id,
    mandateVersionId: request.mandate_version_id,
    action: request.action,
    amountMinor: request.amount_minor.toString(),
    currency: request.currency,
    payeeId: request.payee_id || null,
    targetRef: request.target_ref || null,
    documentSha256: request.document_sha256 || null,
  };
  const canonical = canonicalJson(payload);
  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}
