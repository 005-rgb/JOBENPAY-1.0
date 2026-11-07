/**
 * tests/contract/dispute.contract.test.js
 * Contract test for DISPUTE against Fake PayPal Server (Item 5 CCC, K-DISPUTE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakePayPalServer } from '../../fake-paypal/server.js';
import {
  listDisputes,
  getDispute,
  provideEvidence,
  acceptClaim,
} from '../../server/src/services/paypal/dispute.js';
import './payments.contract.test.js';

let server;
let baseUrl;

test.before(async () => {
  server = createFakePayPalServer();
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test.beforeEach(async () => {
  await fetch(`${baseUrl}/_fake/reset`, { method: 'POST' });
});

test('Dispute Adapter Contract: list, get, provide evidence, and accept claim', async () => {
  let capturedHeaders = null;
  const fakeClient = {
    async request(method, path, options = {}) {
      capturedHeaders = options.headers;
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: options.headers || {},
        body: options.body,
      });
      const text = await res.text();
      return text ? JSON.parse(text) : { status: res.status };
    },
  };

  // 1. List disputes
  const listRes = await listDisputes(fakeClient);
  assert.ok(Array.isArray(listRes.items));
  assert.ok(listRes.items.length >= 1);
  const sampleDispute = listRes.items[0];
  const disputeId = sampleDispute.dispute_id;

  // 2. Get specific dispute
  const getRes = await getDispute(fakeClient, disputeId);
  assert.equal(getRes.disputeId, disputeId);
  assert.equal(getRes.status, 'OPEN');

  // 3. Provide Evidence
  const intentId = 'e0000000-0000-4000-8000-000000000181';
  const evidenceRes = await provideEvidence(fakeClient, {
    intentId,
    disputeId,
    notes: 'Tracking number 1Z9999999999999999 shows delivered',
    step: 'dispute_evidence',
  });

  assert.equal(evidenceRes.outcome, 'EVIDENCE_PROVIDED');
  assert.equal(evidenceRes.status, 'UNDER_REVIEW');
  assert.equal(capturedHeaders['PayPal-Request-Id'], `jp_${intentId}_dispute_evidence`);

  // 4. Accept Claim
  const intentId2 = 'e0000000-0000-4000-8000-000000000182';
  const acceptRes = await acceptClaim(fakeClient, {
    intentId: intentId2,
    disputeId,
    note: 'Merchant accepts refund liability',
    step: 'dispute_accept',
  });

  assert.equal(acceptRes.outcome, 'CLAIM_ACCEPTED');
  assert.equal(acceptRes.status, 'RESOLVED');
  assert.equal(capturedHeaders['PayPal-Request-Id'], `jp_${intentId2}_dispute_accept`);
});

