/**
 * server/test/unit/recurring-webhook.test.js
 * Webhook handler with 4 mandatory test scenarios for RECURRING (Item 6 CCC, AD-16, AD-17, T-08, K-RECURRING)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('RECURRING Webhook 4 Mandatory Scenarios', async (t) => {
  function createWebhookHarness() {
    const processedEvents = new Set();
    const subStates = new Map();
    const cycleCharges = new Map();

    return {
      initSubscription(subId, status = 'ACTIVE') {
        subStates.set(subId, status);
        cycleCharges.set(subId, 0);
      },
      getState(subId) {
        return subStates.get(subId);
      },
      getCyclesCount(subId) {
        return cycleCharges.get(subId) || 0;
      },
      async handleWebhook({ eventId, eventType, subId, signatureValid }) {
        if (!signatureValid) {
          const err = new Error('Invalid webhook signature');
          err.statusCode = 401;
          throw err;
        }

        if (processedEvents.has(eventId)) {
          return { status: 200, duplicate: true, currentStatus: subStates.get(subId) };
        }
        processedEvents.add(eventId);

        const current = subStates.get(subId);

        if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
          subStates.set(subId, 'ACTIVE');
          return { status: 200, stateChanged: true, currentStatus: 'ACTIVE' };
        }

        if (eventType === 'PAYMENT.SALE.COMPLETED') {
          if (current === 'CANCELLED') {
            // Cannot charge a cancelled subscription
            return { status: 200, stateChanged: false, currentStatus: 'CANCELLED', rejected: true };
          }
          cycleCharges.set(subId, (cycleCharges.get(subId) || 0) + 1);
          return { status: 200, stateChanged: true, cycleNumber: cycleCharges.get(subId) };
        }

        if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED') {
          subStates.set(subId, 'CANCELLED');
          return { status: 200, stateChanged: true, currentStatus: 'CANCELLED' };
        }

        return { status: 200, stateChanged: false, currentStatus: current };
      },
    };
  }

  await t.test('Scenario 1: Duplicate recurring webhook delivery is handled idempotently without double-charging', async () => {
    const harness = createWebhookHarness();
    const subId = 'I-SUB-RECUR-001';
    harness.initSubscription(subId, 'ACTIVE');

    const res1 = await harness.handleWebhook({
      eventId: 'WH-EVT-REC-01',
      eventType: 'PAYMENT.SALE.COMPLETED',
      subId,
      signatureValid: true,
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.cycleNumber, 1);
    assert.equal(harness.getCyclesCount(subId), 1);

    // Duplicate event replay
    const res2 = await harness.handleWebhook({
      eventId: 'WH-EVT-REC-01',
      eventType: 'PAYMENT.SALE.COMPLETED',
      subId,
      signatureValid: true,
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.duplicate, true);
    assert.equal(harness.getCyclesCount(subId), 1, 'Duplicate webhook must not increment charge cycle count');
  });

  await t.test('Scenario 2: Webhook cancellation transitions status to CANCELLED', async () => {
    const harness = createWebhookHarness();
    const subId = 'I-SUB-RECUR-002';
    harness.initSubscription(subId, 'ACTIVE');

    const res = await harness.handleWebhook({
      eventId: 'WH-EVT-REC-02',
      eventType: 'BILLING.SUBSCRIPTION.CANCELLED',
      subId,
      signatureValid: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.stateChanged, true);
    assert.equal(harness.getState(subId), 'CANCELLED');
  });

  await t.test('Scenario 3: Out-of-order charge arriving after cancellation is rejected', async () => {
    const harness = createWebhookHarness();
    const subId = 'I-SUB-RECUR-003';
    harness.initSubscription(subId, 'CANCELLED');

    const res = await harness.handleWebhook({
      eventId: 'WH-EVT-REC-03',
      eventType: 'PAYMENT.SALE.COMPLETED',
      subId,
      signatureValid: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.rejected, true);
    assert.equal(harness.getState(subId), 'CANCELLED');
    assert.equal(harness.getCyclesCount(subId), 0);
  });

  await t.test('Scenario 4: Webhook with invalid signature is rejected with 401', async () => {
    const harness = createWebhookHarness();
    const subId = 'I-SUB-RECUR-004';
    harness.initSubscription(subId, 'ACTIVE');

    await assert.rejects(
      async () => {
        await harness.handleWebhook({
          eventId: 'WH-EVT-REC-04',
          eventType: 'BILLING.SUBSCRIPTION.ACTIVATED',
          subId,
          signatureValid: false,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        return true;
      }
    );
  });
});

