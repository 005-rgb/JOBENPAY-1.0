import crypto from 'node:crypto';

import { canonicalJson } from '../../../shared/canonical.js';

export function requestHash({
  orgId,
  agentId,
  mandateVersionId,
  action,
  amountMinor,
  currency,
  payeeId = null,
  targetRef = null,
  documentSha256 = null,
}) {
  const payload = {
    orgId,
    agentId,
    mandateVersionId,
    action,
    amountMinor: BigInt(amountMinor).toString(),
    currency,
    payeeId,
    targetRef,
    documentSha256,
  };
  return crypto.createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex');
}

export const computeRequestHash = requestHash;
