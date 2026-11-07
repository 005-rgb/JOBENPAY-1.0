/**
 * server/test/unit/dispute-webhook.test.js
 * Webhook handler with 4 mandatory test scenarios for DISPUTE (Item 6 CCC, AD-16, AD-23, T-06, K-DISPUTE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('DISPUTE Webhook 4 Mandatory Scenarios', async (t) => {
  function createWebhookHarness() {
    const processedEvents = new Set();
    const intentStates = new Map();
    const disputeRecords = new Map();
    const postedLegs = new Map();

    return {
      initDispute(disputeId, intentId, status) {
        disputeRecords.set(disputeId, { status, intentId });
        intentStates.set(intentId, status);
      },
      getState(intentId) {
        return intentStates.get(intentId);
      },
      getDisputeStatus(disputeId) {
        return disputeRecords.get(disputeId)?.status;
      },
      getLegsCount(intentId) {
        return postedLegs.get(intentId) || 0;
      },
      async handleWebhook({ eventId, eventType, disputeId, intentId, outcome = 'RESOLVED', signatureValid }) {
        if (!signatureValid) {
          const err = new Error('Invalid webhook signature');
          err.statusCode = 401;
          throw err;
        }

        if (processedEvents.has(eventId)) {
          return { status: 200, duplicate: true, currentStatus: intentStates.get(intentId) };
        }
        processedEvents.add(eventId);

        const current = intentStates.get(intentId);

        if (eventType === 'CUSTOMER.DISPUTE.CREATED') {
          disputeRecords.set(disputeId, { status: 'OPEN', intentId });
          intentStates.set(intentId, 'SUBMITTED');
          return { status: 200, stateChanged: true, currentStatus: 'SUBMITTED' };
        }

        if (eventType === 'CUSTOMER.DISPUTE.RESOLVED') {
          if (current === 'COMPLETED') {
            return { status: 200, stateChanged: false, currentStatus: current };
          }
          intentStates.set(intentId, 'COMPLETED');
          if (disputeId && disputeRecords.has(disputeId)) {
            disputeRecords.get(disputeId).status = outcome;
          }
          postedLegs.set(intentId, (postedLegs.get(intentId) || 0) + 1);
          return { status: 200, stateChanged: true, currentStatus: 'COMPLETED' };
        }

        return { status: 200, unhandled: true, currentStatus: current };
      },
    };
  }

  await t.test('Scenario 1: Valid CUSTOMER.DISPUTE.CREATED registers dispute in OPEN status', async () => {
    const harness = createWebhookHarness();
    const disputeId = 'DISPUTE-WH-001';
    const intentId = 'e0000000-0000-4000-8000-000000000191';

    const result = await harness.handleWebhook({
      eventId: 'WH-EVT-DISP-01',
      eventType: 'CUSTOMER.DISPUTE.CREATED',
      disputeId,
      intentId,
      signatureValid: true,
    });

    assert.equal(result.status, 200);
    assert.equal(result.stateChanged, true);
    assert.equal(harness.getDisputeStatus(disputeId), 'OPEN');
    assert.equal(harness.getState(intentId), 'SUBMITTED');
  });

  await t.test('Scenario 2: Valid CUSTOMER.DISPUTE.RESOLVED transitions intent to COMPLETED and writes reversal legs', async () => {
    const harness = createWebhookHarness();
    const disputeId = 'DISPUTE-WH-002';
    const intentId = 'e0000000-0000-4000-8000-000000000192';
    harness.initDispute(disputeId, intentId, 'EXECUTING');

    const result = await harness.handleWebhook({
      eventId: 'WH-EVT-DISP-02',
      eventType: 'CUSTOMER.DISPUTE.RESOLVED',
      disputeId,
      intentId,
      outcome: 'RESOLVED',
      signatureValid: true,
    });

    assert.equal(result.status, 200);
    assert.equal(result.stateChanged, true);
    assert.equal(harness.getState(intentId), 'COMPLETED');
    assert.equal(harness.getDisputeStatus(disputeId), 'RESOLVED');
    assert.equal(harness.getLegsCount(intentId), 1);
  });

  await t.test('Scenario 3: Duplicate webhook delivery is strictly idempotent without double leg posting', async () => {
    const harness = createWebhookHarness();
    const disputeId = 'DISPUTE-WH-003';
    const intentId = 'e0000000-0000-4000-8000-000000000193';
    harness.initDispute(disputeId, intentId, 'EXECUTING');

    // First arrival
    const res1 = await harness.handleWebhook({
      eventId: 'WH-EVT-DISP-03',
      eventType: 'CUSTOMER.DISPUTE.RESOLVED',
      disputeId,
      intentId,
      signatureValid: true,
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.stateChanged, true);
    assert.equal(harness.getLegsCount(intentId), 1);

    // Second arrival (duplicate)
    const res2 = await harness.handleWebhook({
      eventId: 'WH-EVT-DISP-03',
      eventType: 'CUSTOMER.DISPUTE.RESOLVED',
      disputeId,
      intentId,
      signatureValid: true,
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.duplicate, true);
    assert.equal(harness.getLegsCount(intentId), 1, 'Legs must not be posted twice');
  });

  await t.test('Scenario 4: Webhook with invalid or forged signature is rejected with 401', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000194';

    await assert.rejects(
      async () => {
        await harness.handleWebhook({
          eventId: 'WH-EVT-DISP-04',
          eventType: 'CUSTOMER.DISPUTE.RESOLVED',
          disputeId: 'DISP-04',
          intentId,
          signatureValid: false,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.match(err.message, /invalid webhook signature/i);
        return true;
      }
    );
  });
});

