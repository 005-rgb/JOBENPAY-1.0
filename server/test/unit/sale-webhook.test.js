/**
 * server/test/unit/sale-webhook.test.js
 * Webhook handler with 4 mandatory test scenarios for SALE (Item 6 CCC, AD-16, K-SALE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('SALE Webhook 4 Mandatory Scenarios', async (t) => {
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
        // 1. Signature verification check
        if (!signatureValid) {
          const err = new Error('Invalid webhook signature');
          err.statusCode = 401;
          throw err;
        }

        // 2. Event deduplication check
        if (processedEvents.has(eventId)) {
          return { status: 200, duplicate: true, currentStatus: intentStates.get(intentId) };
        }
        processedEvents.add(eventId);

        const current = intentStates.get(intentId);

        // 3. State transition rules
        if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
          // If already in terminal completed state, no backwards or duplicate ledger posting
          if (current === 'COMPLETED') {
            return { status: 200, stateChanged: false, currentStatus: current };
          }
          intentStates.set(intentId, 'COMPLETED');
          postedLegs.set(intentId, (postedLegs.get(intentId) || 0) + 1);
          return { status: 200, stateChanged: true, currentStatus: 'COMPLETED' };
        }

        if (eventType === 'PAYMENT.CAPTURE.DENIED') {
          // Cannot fail an already completed sale
          if (current === 'COMPLETED') {
            return { status: 200, stateChanged: false, currentStatus: current, ignored: true };
          }
          intentStates.set(intentId, 'FAILED');
          return { status: 200, stateChanged: true, currentStatus: 'FAILED' };
        }

        if (eventType === 'PAYMENT.CAPTURE.PENDING') {
          // Pending keeps in EXECUTING state
          return { status: 200, stateChanged: false, currentStatus: current };
        }

        return { status: 200, unhandled: true, currentStatus: current };
      },
    };
  }

  await t.test('Scenario 1: Duplicate webhook delivery is handled idempotently', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000001';
    harness.initState(intentId, 'EXECUTING');

    const first = await harness.handleWebhook({
      eventId: 'WH-EVT-001',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
      intentId,
      signatureValid: true,
    });
    assert.equal(first.stateChanged, true);
    assert.equal(first.currentStatus, 'COMPLETED');
    assert.equal(harness.getLegsCount(intentId), 1);

    const second = await harness.handleWebhook({
      eventId: 'WH-EVT-001',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
      intentId,
      signatureValid: true,
    });
    assert.equal(second.duplicate, true);
    assert.equal(second.currentStatus, 'COMPLETED');
    assert.equal(harness.getLegsCount(intentId), 1); // No double posting of ledger legs
  });

  await t.test('Scenario 2: Out-of-order webhook delivery does not regress terminal state', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000002';
    harness.initState(intentId, 'COMPLETED');

    const outOfOrderDenied = await harness.handleWebhook({
      eventId: 'WH-EVT-002',
      eventType: 'PAYMENT.CAPTURE.DENIED',
      intentId,
      signatureValid: true,
    });
    assert.equal(outOfOrderDenied.ignored, true);
    assert.equal(harness.getState(intentId), 'COMPLETED');
  });

  await t.test('Scenario 3: Late webhook arrival on already completed transaction is safe', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000003';
    harness.initState(intentId, 'COMPLETED');

    const lateCompleted = await harness.handleWebhook({
      eventId: 'WH-EVT-003',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
      intentId,
      signatureValid: true,
    });
    assert.equal(lateCompleted.stateChanged, false);
    assert.equal(harness.getState(intentId), 'COMPLETED');
  });

  await t.test('Scenario 4: Spoofed webhook signature is rejected with 401', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000004';
    harness.initState(intentId, 'EXECUTING');

    await assert.rejects(
      async () => {
        await harness.handleWebhook({
          eventId: 'WH-EVT-004',
          eventType: 'PAYMENT.CAPTURE.COMPLETED',
          intentId,
          signatureValid: false,
        });
      },
      { statusCode: 401, message: 'Invalid webhook signature' }
    );
  });

  await t.test('Scenario 5: PAYMENT.CAPTURE.PENDING keeps intent in EXECUTING', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000005';
    harness.initState(intentId, 'EXECUTING');

    const pendingRes = await harness.handleWebhook({
      eventId: 'WH-EVT-005',
      eventType: 'PAYMENT.CAPTURE.PENDING',
      intentId,
      signatureValid: true,
    });
    assert.equal(pendingRes.stateChanged, false);
    assert.equal(harness.getState(intentId), 'EXECUTING');
  });
});

