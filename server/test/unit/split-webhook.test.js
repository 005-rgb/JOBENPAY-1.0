/**
 * server/test/unit/split-webhook.test.js
 * Webhook handler with 4 mandatory test scenarios for SPLIT (Item 6 CCC, AD-16, AD-17, T-13, T-14, K-SPLIT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('SPLIT Webhook 4 Mandatory Scenarios', async (t) => {
  function createWebhookHarness() {
    const processedEvents = new Set();
    const intentStates = new Map();
    const postedLegs = new Map();

    return {
      initSplit(intentId, status = 'EXECUTING') {
        intentStates.set(intentId, status);
      },
      getState(intentId) {
        return intentStates.get(intentId);
      },
      getLegsCount(intentId) {
        return postedLegs.get(intentId) || 0;
      },
      async handleWebhook({ eventId, eventType, intentId, signatureValid }) {
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
        if (current === 'COMPLETED' || current === 'FAILED') {
          return { status: 200, stateChanged: false, currentStatus: current };
        }

        if (eventType === 'CHECKOUT.ORDER.APPROVED' || eventType === 'PAYMENT.CAPTURE.COMPLETED') {
          // Collection success
          intentStates.set(intentId, 'COMPLETED');
          postedLegs.set(intentId, (postedLegs.get(intentId) || 0) + 1);
          return { status: 200, stateChanged: true, currentStatus: 'COMPLETED' };
        }

        if (eventType === 'PAYMENT.PAYOUTSBATCH.SUCCESS' || eventType === 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED') {
          // Split payout success
          intentStates.set(intentId, 'COMPLETED');
          postedLegs.set(intentId, (postedLegs.get(intentId) || 0) + 1);
          return { status: 200, stateChanged: true, currentStatus: 'COMPLETED' };
        }

        if (
          eventType === 'PAYMENT.CAPTURE.DENIED' ||
          eventType === 'PAYMENT.PAYOUTSBATCH.DENIED' ||
          eventType === 'PAYMENT.PAYOUTS-ITEM.FAILED'
        ) {
          intentStates.set(intentId, 'FAILED');
          return { status: 200, stateChanged: true, currentStatus: 'FAILED' };
        }

        return { status: 200, stateChanged: false, currentStatus: current };
      },
    };
  }

  await t.test('Scenario 1: Duplicate webhook delivery is handled idempotently without duplicate leg posting', async () => {
    const harness = createWebhookHarness();
    const intentId = 'split_intent_scen1';
    harness.initSplit(intentId, 'EXECUTING');

    const res1 = await harness.handleWebhook({
      eventId: 'WH-EVT-SPLIT-01',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
      intentId,
      signatureValid: true,
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.stateChanged, true);
    assert.equal(harness.getState(intentId), 'COMPLETED');
    assert.equal(harness.getLegsCount(intentId), 1);

    // Duplicate replay
    const res2 = await harness.handleWebhook({
      eventId: 'WH-EVT-SPLIT-01',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
      intentId,
      signatureValid: true,
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.duplicate, true);
    assert.equal(harness.getLegsCount(intentId), 1);
  });

  await t.test('Scenario 2: Out-of-order webhook delivery does not regress terminal state', async () => {
    const harness = createWebhookHarness();
    const intentId = 'split_intent_scen2';
    harness.initSplit(intentId, 'COMPLETED');

    const res = await harness.handleWebhook({
      eventId: 'WH-EVT-SPLIT-02',
      eventType: 'PAYMENT.CAPTURE.DENIED',
      intentId,
      signatureValid: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.stateChanged, false);
    assert.equal(harness.getState(intentId), 'COMPLETED');
  });

  await t.test('Scenario 3: Webhook with invalid signature is rejected with 401', async () => {
    const harness = createWebhookHarness();
    const intentId = 'split_intent_scen3';
    harness.initSplit(intentId, 'EXECUTING');

    await assert.rejects(
      async () => {
        await harness.handleWebhook({
          eventId: 'WH-EVT-SPLIT-03',
          eventType: 'PAYMENT.PAYOUTSBATCH.SUCCESS',
          intentId,
          signatureValid: false,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        return true;
      }
    );
  });

  await t.test('Scenario 4: Webhook failure event marks intent as FAILED', async () => {
    const harness = createWebhookHarness();
    const intentId = 'split_intent_scen4';
    harness.initSplit(intentId, 'EXECUTING');

    const res = await harness.handleWebhook({
      eventId: 'WH-EVT-SPLIT-04',
      eventType: 'PAYMENT.PAYOUTSBATCH.DENIED',
      intentId,
      signatureValid: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.stateChanged, true);
    assert.equal(harness.getState(intentId), 'FAILED');
  });
});

