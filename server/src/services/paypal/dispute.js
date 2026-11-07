/**
 * server/src/services/paypal/dispute.js
 * PayPal Customer Disputes API v1 Adapter for DISPUTE (PRD 1.3 §1.2, AD-12, AD-23, T-06, K-DISPUTE)
 */

export async function listDisputes(paypalClient) {
  const response = await paypalClient.request('GET', '/v1/customer-disputes', {
    headers: { 'Content-Type': 'application/json' },
  });

  return {
    items: response?.items || [],
    raw: response,
  };
}

export async function getDispute(paypalClient, disputeId) {
  const response = await paypalClient.request('GET', `/v1/customer-disputes/${disputeId}`, {
    headers: { 'Content-Type': 'application/json' },
  });

  return {
    disputeId: response?.dispute_id,
    status: response?.status,
    amount: response?.dispute_amount,
    reason: response?.reason,
    raw: response,
  };
}

export async function provideEvidence(paypalClient, {
  intentId,
  disputeId,
  evidenceType = 'PROOF_OF_FULFILLMENT',
  notes = 'Proof of delivery provided by Jobenpay merchant',
  step = 'dispute_evidence',
}) {
  const requestId = `jp_${intentId}_${step}`;

  const payload = {
    evidences: [
      {
        evidence_type: evidenceType,
        notes,
      },
    ],
  };

  const response = await paypalClient.request('POST', `/v1/customer-disputes/${disputeId}/provide-evidence`, {
    body: JSON.stringify(payload),
    headers: {
      'PayPal-Request-Id': requestId,
      'Content-Type': 'application/json',
    },
  });

  return {
    outcome: 'EVIDENCE_PROVIDED',
    disputeId,
    status: response?.status || 'UNDER_REVIEW',
    providerRefs: {
      disputeId,
      status: response?.status || 'UNDER_REVIEW',
    },
    raw: response,
  };
}

export async function acceptClaim(paypalClient, {
  intentId,
  disputeId,
  note = 'Claim accepted and refund authorized by merchant',
  step = 'dispute_accept',
}) {
  const requestId = `jp_${intentId}_${step}`;

  const payload = {
    note,
    accept_claim_reason: 'DID_NOT_SHIP_MERCHANDISE',
  };

  const response = await paypalClient.request('POST', `/v1/customer-disputes/${disputeId}/accept-claim`, {
    body: JSON.stringify(payload),
    headers: {
      'PayPal-Request-Id': requestId,
      'Content-Type': 'application/json',
    },
  });

  return {
    outcome: 'CLAIM_ACCEPTED',
    disputeId,
    status: response?.status || 'RESOLVED',
    providerRefs: {
      disputeId,
      status: response?.status || 'RESOLVED',
    },
    raw: response,
  };
}

export default {
  listDisputes,
  getDispute,
  provideEvidence,
  acceptClaim,
};

