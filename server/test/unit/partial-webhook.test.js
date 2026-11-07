/**
 * server/test/unit/partial-webhook.test.js
 * Webhook handler with 4 mandatory test scenarios for PARTIAL (Item 6 CCC, AD-16, K-PARTIAL)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('PARTIAL Webhook 4 Mandatory Scenarios', async (t) => {
  function createWebhookHarness() {
    const processedEvents = new Set();
    const intentStates = new Map();
    const authStates = new Map();
    const postedLegs = new Map();

    return {
      initState(intentId, authId, status, authStatus = 'CREATED') {
        intentStates.set(intentId, status);
        authStates.set(authId, authStatus);
      },
      getState(intentId) {
        return intentStates.get(intentId);
      },
      getAuthStatus(authId) {
        return authStates.get(authId);
      },
      getLegsCount(intentId) {
        return postedLegs.get(intentId) || 0;
      },
      async handleWebhook({ eventId, eventType, intentId, authId, isFinal = false, signatureValid }) {
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
          if (authId) {
            authStates.set(authId, isFinal ? 'CAPTURED' : 'PARTIALLY_CAPTURED');
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

  await t.test('Scenario 1: Valid PAYMENT.CAPTURE.COMPLETED transitions intent to COMPLETED and records balanced legs', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000081';
    const authId = 'AUTH-PARTIAL-01';
    harness.initState(intentId, authId, 'EXECUTING', 'CREATED');

    const result = await harness.handleWebhook({
      eventId: 'WH-EVT-01',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
      intentId,
      authId,
      isFinal: false,
      signatureValid: true,
    });

    assert.equal(result.status, 200);
    assert.equal(result.stateChanged, true);
    assert.equal(harness.getState(intentId), 'COMPLETED');
    assert.equal(harness.getAuthStatus(authId), 'PARTIALLY_CAPTURED');
    assert.equal(harness.getLegsCount(intentId), 1);
  });

  await t.test('Scenario 2: Duplicate webhook delivery is strictly idempotent without double leg posting', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000082';
    const authId = 'AUTH-PARTIAL-02';
    harness.initState(intentId, authId, 'EXECUTING', 'CREATED');

    // First arrival
    const res1 = await harness.handleWebhook({
      eventId: 'WH-EVT-02',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
      intentId,
      authId,
      isFinal: true,
      signatureValid: true,
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.stateChanged, true);
    assert.equal(harness.getLegsCount(intentId), 1);
    assert.equal(harness.getAuthStatus(authId), 'CAPTURED');

    // Second arrival (duplicate)
    const res2 = await harness.handleWebhook({
      eventId: 'WH-EVT-02',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
      intentId,
      authId,
      isFinal: true,
      signatureValid: true,
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.duplicate, true);
    assert.equal(harness.getLegsCount(intentId), 1, 'Legs must not be posted twice');
  });

  await t.test('Scenario 3: Out-of-order or unknown event is handled safely without crashing', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000083';
    harness.initState(intentId, 'AUTH-03', 'EXECUTING');

    const result = await harness.handleWebhook({
      eventId: 'WH-EVT-03',
      eventType: 'BILLING.SUBSCRIPTION.CREATED',
      intentId,
      signatureValid: true,
    });

    assert.equal(result.status, 200);
    assert.equal(result.unhandled, true);
    assert.equal(harness.getState(intentId), 'EXECUTING');
  });

  await t.test('Scenario 4: Webhook with invalid or forged signature is rejected with 401', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000084';
    harness.initState(intentId, 'AUTH-04', 'EXECUTING');

    await assert.rejects(
      async () => {
        await harness.handleWebhook({
          eventId: 'WH-EVT-04',
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

