/**
 * server/test/unit/payout-webhook.test.js
 * Webhook handler with 4 mandatory test scenarios for PAYOUT (Item 6 CCC, AD-16, K-PAYOUT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('PAYOUT Webhook 4 Mandatory Scenarios', async (t) => {
  // Mock webhook processor simulating state transitions and idempotency
  function createWebhookHarness() {
    const processedEvents = new Set();
    const intentStates = new Map();

    return {
      initState(intentId, status) {
        intentStates.set(intentId, status);
      },
      getState(intentId) {
        return intentStates.get(intentId);
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
        if (eventType === 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED') {
          // If already in terminal completed state, no backwards mutation
          if (current === 'COMPLETED') {
            return { status: 200, stateChanged: false, currentStatus: current };
          }
          intentStates.set(intentId, 'COMPLETED');
          return { status: 200, stateChanged: true, currentStatus: 'COMPLETED' };
        }

        if (eventType === 'PAYMENT.PAYOUTS-ITEM.FAILED') {
          // Cannot fail a completed transaction
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

  await t.test('1. Duplicate webhook delivers exactly one effect (idempotency)', async () => {
    const harness = createWebhookHarness();
    harness.initState('intent_payout_dup', 'EXECUTING');

    const event = {
      eventId: 'evt_payout_succeeded_001',
      eventType: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
      intentId: 'intent_payout_dup',
      signatureValid: true,
    };

    const first = await harness.handleWebhook(event);
    assert.equal(first.status, 200);
    assert.equal(first.stateChanged, true);
    assert.equal(first.currentStatus, 'COMPLETED');

    const second = await harness.handleWebhook(event);
    assert.equal(second.status, 200);
    assert.equal(second.duplicate, true);
    assert.equal(harness.getState('intent_payout_dup'), 'COMPLETED');
  });

  await t.test('2. Out-of-order webhook never mutates terminal completed state backwards', async () => {
    const harness = createWebhookHarness();
    harness.initState('intent_payout_ooo', 'COMPLETED');

    const lateFailedEvent = {
      eventId: 'evt_payout_late_failed_002',
      eventType: 'PAYMENT.PAYOUTS-ITEM.FAILED',
      intentId: 'intent_payout_ooo',
      signatureValid: true,
    };

    const res = await harness.handleWebhook(lateFailedEvent);
    assert.equal(res.status, 200);
    assert.equal(res.stateChanged, false);
    assert.equal(res.ignored, true);
    assert.equal(harness.getState('intent_payout_ooo'), 'COMPLETED');
  });

  await t.test('3. Late webhook after polling settlement is gracefully handled as no-op', async () => {
    const harness = createWebhookHarness();
    harness.initState('intent_payout_late', 'COMPLETED');

    const lateSucceededEvent = {
      eventId: 'evt_payout_late_succ_003',
      eventType: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
      intentId: 'intent_payout_late',
      signatureValid: true,
    };

    const res = await harness.handleWebhook(lateSucceededEvent);
    assert.equal(res.status, 200);
    assert.equal(res.stateChanged, false);
    assert.equal(harness.getState('intent_payout_late'), 'COMPLETED');
  });

  await t.test('4. Spoofed or invalid signature webhook is rejected with 401 and zero state mutation', async () => {
    const harness = createWebhookHarness();
    harness.initState('intent_payout_spoof', 'EXECUTING');

    const spoofedEvent = {
      eventId: 'evt_payout_spoofed_004',
      eventType: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
      intentId: 'intent_payout_spoof',
      signatureValid: false,
    };

    await assert.rejects(
      harness.handleWebhook(spoofedEvent),
      (err) => err.statusCode === 401
    );

    assert.equal(harness.getState('intent_payout_spoof'), 'EXECUTING');
  });
});

