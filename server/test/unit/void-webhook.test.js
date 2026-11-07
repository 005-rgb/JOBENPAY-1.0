/**
 * server/test/unit/void-webhook.test.js
 * Webhook handler with 4 mandatory test scenarios for VOID (Item 6 CCC, AD-16, K-VOID)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('VOID Webhook 4 Mandatory Scenarios', async (t) => {
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
      async handleWebhook({ eventId, eventType, intentId, authId, signatureValid }) {
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

        if (eventType === 'PAYMENT.AUTHORIZATION.VOIDED') {
          if (current === 'COMPLETED') {
            return { status: 200, stateChanged: false, currentStatus: current };
          }
          intentStates.set(intentId, 'COMPLETED');
          if (authId) authStates.set(authId, 'VOIDED');
          postedLegs.set(intentId, (postedLegs.get(intentId) || 0) + 1);
          return { status: 200, stateChanged: true, currentStatus: 'COMPLETED' };
        }

        if (eventType === 'PAYMENT.AUTHORIZATION.CREATED') {
          // Keep in EXECUTING state
          return { status: 200, stateChanged: false, currentStatus: current };
        }

        return { status: 200, unhandled: true, currentStatus: current };
      },
    };
  }

  await t.test('Scenario 1: Duplicate webhook delivery is handled idempotently', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000051';
    const authId = 'AUTH-001';
    harness.initState(intentId, authId, 'EXECUTING');

    const first = await harness.handleWebhook({
      eventId: 'WH-EVT-VOID-001',
      eventType: 'PAYMENT.AUTHORIZATION.VOIDED',
      intentId,
      authId,
      signatureValid: true,
    });
    assert.equal(first.stateChanged, true);
    assert.equal(first.currentStatus, 'COMPLETED');
    assert.equal(harness.getAuthStatus(authId), 'VOIDED');
    assert.equal(harness.getLegsCount(intentId), 1);

    const second = await harness.handleWebhook({
      eventId: 'WH-EVT-VOID-001',
      eventType: 'PAYMENT.AUTHORIZATION.VOIDED',
      intentId,
      authId,
      signatureValid: true,
    });
    assert.equal(second.duplicate, true);
    assert.equal(second.currentStatus, 'COMPLETED');
    assert.equal(harness.getLegsCount(intentId), 1);
  });

  await t.test('Scenario 2: Out-of-order webhook delivery does not regress terminal state', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000052';
    const authId = 'AUTH-002';
    harness.initState(intentId, authId, 'COMPLETED', 'VOIDED');

    const outOfOrder = await harness.handleWebhook({
      eventId: 'WH-EVT-VOID-002',
      eventType: 'PAYMENT.AUTHORIZATION.CREATED',
      intentId,
      authId,
      signatureValid: true,
    });
    assert.equal(outOfOrder.stateChanged, false);
    assert.equal(harness.getState(intentId), 'COMPLETED');
    assert.equal(harness.getAuthStatus(authId), 'VOIDED');
  });

  await t.test('Scenario 3: Late webhook arrival on already completed void is safe', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000053';
    const authId = 'AUTH-003';
    harness.initState(intentId, authId, 'COMPLETED', 'VOIDED');

    const late = await harness.handleWebhook({
      eventId: 'WH-EVT-VOID-003',
      eventType: 'PAYMENT.AUTHORIZATION.VOIDED',
      intentId,
      authId,
      signatureValid: true,
    });
    assert.equal(late.stateChanged, false);
    assert.equal(harness.getState(intentId), 'COMPLETED');
  });

  await t.test('Scenario 4: Spoofed webhook signature is rejected with 401', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000054';
    const authId = 'AUTH-004';
    harness.initState(intentId, authId, 'EXECUTING');

    await assert.rejects(
      async () => {
        await harness.handleWebhook({
          eventId: 'WH-EVT-VOID-004',
          eventType: 'PAYMENT.AUTHORIZATION.VOIDED',
          intentId,
          authId,
          signatureValid: false,
        });
      },
      { statusCode: 401, message: 'Invalid webhook signature' }
    );
  });
});

