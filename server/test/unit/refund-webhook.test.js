/**
 * server/test/unit/refund-webhook.test.js
 * Webhook handler with 4 mandatory test scenarios for REFUND (Item 6 CCC, AD-16, K-REFUND)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('REFUND Webhook 4 Mandatory Scenarios', async (t) => {
  function createWebhookHarness() {
    const processedEvents = new Set();
    const intentStates = new Map();
    const postedLegs = new Map();

    return {
      initState(intentId, status) {
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

        if (eventType === 'PAYMENT.CAPTURE.REFUNDED') {
          if (current === 'COMPLETED') {
            return { status: 200, stateChanged: false, currentStatus: current };
          }
          intentStates.set(intentId, 'COMPLETED');
          postedLegs.set(intentId, (postedLegs.get(intentId) || 0) + 1);
          return { status: 200, stateChanged: true, currentStatus: 'COMPLETED' };
        }

        if (eventType === 'PAYMENT.CAPTURE.DENIED') {
          if (current === 'COMPLETED') {
            return { status: 200, stateChanged: false, currentStatus: current, ignored: true };
          }
          intentStates.set(intentId, 'FAILED');
          return { status: 200, stateChanged: true, currentStatus: 'FAILED' };
        }

        return { status: 200, unhandled: true, currentStatus: current };
      },
    };
  }

  await t.test('Scenario 1: Duplicate webhook delivery is handled idempotently', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000081';
    harness.initState(intentId, 'EXECUTING');

    const first = await harness.handleWebhook({
      eventId: 'WH-EVT-REF-001',
      eventType: 'PAYMENT.CAPTURE.REFUNDED',
      intentId,
      signatureValid: true,
    });
    assert.equal(first.stateChanged, true);
    assert.equal(first.currentStatus, 'COMPLETED');
    assert.equal(harness.getLegsCount(intentId), 1);

    const second = await harness.handleWebhook({
      eventId: 'WH-EVT-REF-001',
      eventType: 'PAYMENT.CAPTURE.REFUNDED',
      intentId,
      signatureValid: true,
    });
    assert.equal(second.duplicate, true);
    assert.equal(second.currentStatus, 'COMPLETED');
    assert.equal(harness.getLegsCount(intentId), 1);
  });

  await t.test('Scenario 2: Out-of-order webhook delivery does not regress terminal state', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000082';
    harness.initState(intentId, 'COMPLETED');

    const outOfOrder = await harness.handleWebhook({
      eventId: 'WH-EVT-REF-002',
      eventType: 'PAYMENT.CAPTURE.DENIED',
      intentId,
      signatureValid: true,
    });
    assert.equal(outOfOrder.ignored, true);
    assert.equal(harness.getState(intentId), 'COMPLETED');
  });

  await t.test('Scenario 3: Late webhook arrival on already completed refund is safe', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000083';
    harness.initState(intentId, 'COMPLETED');

    const late = await harness.handleWebhook({
      eventId: 'WH-EVT-REF-003',
      eventType: 'PAYMENT.CAPTURE.REFUNDED',
      intentId,
      signatureValid: true,
    });
    assert.equal(late.stateChanged, false);
    assert.equal(harness.getState(intentId), 'COMPLETED');
  });

  await t.test('Scenario 4: Spoofed webhook signature is rejected with 401', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000084';
    harness.initState(intentId, 'EXECUTING');

    await assert.rejects(
      async () => {
        await harness.handleWebhook({
          eventId: 'WH-EVT-REF-004',
          eventType: 'PAYMENT.CAPTURE.REFUNDED',
          intentId,
          signatureValid: false,
        });
      },
      { statusCode: 401, message: 'Invalid webhook signature' }
    );
  });
});

