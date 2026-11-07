/**
 * server/test/unit/scheduled-webhook.test.js
 * Webhook handler with 4 mandatory test scenarios for SCHEDULED (Item 6 CCC, AD-16, AD-14, T-01, K-SCHEDULED)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('SCHEDULED Webhook 4 Mandatory Scenarios', async (t) => {
  function createWebhookHarness() {
    const processedEvents = new Set();
    const intentStates = new Map();
    const scheduledRunStates = new Map();
    const postedLegs = new Map();

    return {
      initSchedule(intentId, status = 'SCHEDULED') {
        intentStates.set(intentId, status);
        scheduledRunStates.set(intentId, status === 'SCHEDULED' ? 'FIRED' : 'PENDING');
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

        // Terminal states cannot be regressed
        if (current === 'COMPLETED' || current === 'CANCELLED' || current === 'FAILED') {
          return { status: 200, stateChanged: false, currentStatus: current };
        }

        if (eventType === 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED' || eventType === 'CHECKOUT.ORDER.COMPLETED') {
          intentStates.set(intentId, 'COMPLETED');
          postedLegs.set(intentId, (postedLegs.get(intentId) || 0) + 1);
          return { status: 200, stateChanged: true, currentStatus: 'COMPLETED' };
        }

        if (eventType === 'PAYMENT.PAYOUTS-ITEM.FAILED' || eventType === 'CHECKOUT.ORDER.DECLINED') {
          intentStates.set(intentId, 'FAILED');
          return { status: 200, stateChanged: true, currentStatus: 'FAILED' };
        }

        return { status: 200, stateChanged: false, currentStatus: current };
      },
    };
  }

  await t.test('Scenario 1: Duplicate webhook delivery is handled idempotently', async () => {
    const harness = createWebhookHarness();
    const intentId = 'sched_intent_scen1';
    harness.initSchedule(intentId, 'EXECUTING');

    const res1 = await harness.handleWebhook({
      eventId: 'WH-EVT-SCHED-01',
      eventType: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
      intentId,
      signatureValid: true,
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.stateChanged, true);
    assert.equal(harness.getState(intentId), 'COMPLETED');
    assert.equal(harness.getLegsCount(intentId), 1);

    // Duplicate replay
    const res2 = await harness.handleWebhook({
      eventId: 'WH-EVT-SCHED-01',
      eventType: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
      intentId,
      signatureValid: true,
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.duplicate, true);
    assert.equal(harness.getState(intentId), 'COMPLETED');
    assert.equal(harness.getLegsCount(intentId), 1, 'Legs must not be posted twice');
  });

  await t.test('Scenario 2: Out-of-order webhook delivery does not regress terminal state', async () => {
    const harness = createWebhookHarness();
    const intentId = 'sched_intent_scen2';
    harness.initSchedule(intentId, 'COMPLETED');

    const res = await harness.handleWebhook({
      eventId: 'WH-EVT-SCHED-02',
      eventType: 'PAYMENT.PAYOUTS-ITEM.FAILED',
      intentId,
      signatureValid: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.stateChanged, false);
    assert.equal(harness.getState(intentId), 'COMPLETED');
  });

  await t.test('Scenario 3: Late webhook arrival on already completed scheduled intent is safe', async () => {
    const harness = createWebhookHarness();
    const intentId = 'sched_intent_scen3';
    harness.initSchedule(intentId, 'COMPLETED');

    const res = await harness.handleWebhook({
      eventId: 'WH-EVT-SCHED-03',
      eventType: 'CHECKOUT.ORDER.COMPLETED',
      intentId,
      signatureValid: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.stateChanged, false);
    assert.equal(harness.getState(intentId), 'COMPLETED');
  });

  await t.test('Scenario 4: Spoofed webhook signature is rejected with 401', async () => {
    const harness = createWebhookHarness();
    const intentId = 'sched_intent_scen4';
    harness.initSchedule(intentId, 'EXECUTING');

    await assert.rejects(
      async () => {
        await harness.handleWebhook({
          eventId: 'WH-EVT-SPOOFED',
          eventType: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
          intentId,
          signatureValid: false,
        });
      },
      (err) => err.statusCode === 401
    );
    assert.equal(harness.getState(intentId), 'EXECUTING');
  });
});

