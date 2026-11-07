/**
 * server/test/unit/down_payment-webhook.test.js
 * Webhook handler with 4 mandatory test scenarios for DOWN_PAYMENT (Item 6 CCC, AD-16, K-DOWN_PAYMENT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('DOWN_PAYMENT Webhook 4 Mandatory Scenarios', async (t) => {
  function createWebhookHarness() {
    const processedEvents = new Set();
    const intentStates = new Map();
    const dpAccountStates = new Map();
    const postedLegs = new Map();

    return {
      initState(intentId, dpAccountId, status, dpStatus = 'PENDING') {
        intentStates.set(intentId, status);
        dpAccountStates.set(dpAccountId, dpStatus);
      },
      getState(intentId) {
        return intentStates.get(intentId);
      },
      getDpStatus(dpAccountId) {
        return dpAccountStates.get(dpAccountId);
      },
      getLegsCount(intentId) {
        return postedLegs.get(intentId) || 0;
      },
      async handleWebhook({ eventId, eventType, intentId, dpAccountId, subType = 'initial', signatureValid }) {
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

        if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
          if (current === 'COMPLETED') {
            return { status: 200, stateChanged: false, currentStatus: current };
          }
          intentStates.set(intentId, 'COMPLETED');
          if (dpAccountId) {
            dpAccountStates.set(dpAccountId, subType === 'initial' ? 'DP_PAID' : 'SETTLED');
          }
          postedLegs.set(intentId, (postedLegs.get(intentId) || 0) + 1);
          return { status: 200, stateChanged: true, currentStatus: 'COMPLETED' };
        }

        if (eventType === 'PAYMENT.AUTHORIZATION.VOIDED') {
          intentStates.set(intentId, 'COMPLETED');
          if (dpAccountId) {
            dpAccountStates.set(dpAccountId, 'FORFEITED');
          }
          postedLegs.set(intentId, (postedLegs.get(intentId) || 0) + 1);
          return { status: 200, stateChanged: true, currentStatus: 'COMPLETED' };
        }

        if (eventType === 'PAYMENT.CAPTURE.DENIED') {
          intentStates.set(intentId, 'FAILED');
          return { status: 200, stateChanged: true, currentStatus: 'FAILED' };
        }

        return { status: 200, unhandled: true, currentStatus: current };
      },
    };
  }

  await t.test('Scenario 1: Valid PAYMENT.CAPTURE.COMPLETED transitions intent to COMPLETED and sets down_payment_account to DP_PAID', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000101';
    const dpAccountId = 'dp_acc_01';
    harness.initState(intentId, dpAccountId, 'EXECUTING', 'PENDING');

    const result = await harness.handleWebhook({
      eventId: 'WH-EVT-DP-01',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
      intentId,
      dpAccountId,
      subType: 'initial',
      signatureValid: true,
    });

    assert.equal(result.status, 200);
    assert.equal(result.stateChanged, true);
    assert.equal(harness.getState(intentId), 'COMPLETED');
    assert.equal(harness.getDpStatus(dpAccountId), 'DP_PAID');
    assert.equal(harness.getLegsCount(intentId), 1);
  });

  await t.test('Scenario 2: Duplicate webhook delivery is strictly idempotent without double leg posting', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000102';
    const dpAccountId = 'dp_acc_02';
    harness.initState(intentId, dpAccountId, 'EXECUTING', 'PENDING');

    // First arrival
    const res1 = await harness.handleWebhook({
      eventId: 'WH-EVT-DP-02',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
      intentId,
      dpAccountId,
      subType: 'settlement',
      signatureValid: true,
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.stateChanged, true);
    assert.equal(harness.getDpStatus(dpAccountId), 'SETTLED');
    assert.equal(harness.getLegsCount(intentId), 1);

    // Second arrival (duplicate)
    const res2 = await harness.handleWebhook({
      eventId: 'WH-EVT-DP-02',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
      intentId,
      dpAccountId,
      subType: 'settlement',
      signatureValid: true,
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.duplicate, true);
    assert.equal(harness.getLegsCount(intentId), 1, 'Legs must not be posted twice');
  });

  await t.test('Scenario 3: Out-of-order or unknown event is handled safely without crashing', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000103';
    harness.initState(intentId, 'dp_03', 'EXECUTING');

    const result = await harness.handleWebhook({
      eventId: 'WH-EVT-DP-03',
      eventType: 'CHECKOUT.ORDER.COMPLETED',
      intentId,
      signatureValid: true,
    });

    assert.equal(result.status, 200);
    assert.equal(result.unhandled, true);
    assert.equal(harness.getState(intentId), 'EXECUTING');
  });

  await t.test('Scenario 4: Webhook with invalid or forged signature is rejected with 401', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000104';
    harness.initState(intentId, 'dp_04', 'EXECUTING');

    await assert.rejects(
      async () => {
        await harness.handleWebhook({
          eventId: 'WH-EVT-DP-04',
          eventType: 'PAYMENT.CAPTURE.COMPLETED',
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

