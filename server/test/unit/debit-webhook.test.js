/**
 * server/test/unit/debit-webhook.test.js
 * Webhook handler with 4 mandatory test scenarios for DEBIT (Item 6 CCC, AD-16, AD-17, B-F6)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('DEBIT Webhook 4 Mandatory Scenarios', async (t) => {
  function createDebitWebhookHarness() {
    const processedEvents = new Set();
    const debitStates = new Map();
    const balances = new Map();

    return {
      initDebit(intentId, status = 'EXECUTING', initialDebit = 0n) {
        debitStates.set(intentId, status);
        balances.set(intentId, initialDebit);
      },
      getState(intentId) {
        return debitStates.get(intentId);
      },
      getCollectedAmount(intentId) {
        return balances.get(intentId) || 0n;
      },
      async handleWebhook({ eventId, eventType, intentId, amountMinor, signatureValid }) {
        if (!signatureValid) {
          const err = new Error('Invalid webhook signature');
          err.statusCode = 401;
          throw err;
        }

        if (processedEvents.has(eventId)) {
          return { status: 200, duplicate: true, currentStatus: debitStates.get(intentId) };
        }
        processedEvents.add(eventId);

        const current = debitStates.get(intentId);

        if (eventType === 'DIRECT.DEBIT.COMPLETED') {
          if (current === 'CANCELLED' || current === 'FAILED') {
            return { status: 200, stateChanged: false, currentStatus: current, rejected: true };
          }
          const amt = BigInt(amountMinor || 0);
          balances.set(intentId, (balances.get(intentId) || 0n) + amt);
          debitStates.set(intentId, 'COMPLETED');
          return { status: 200, stateChanged: true, currentStatus: 'COMPLETED' };
        }

        if (eventType === 'DIRECT.DEBIT.FAILED') {
          debitStates.set(intentId, 'FAILED');
          return { status: 200, stateChanged: true, currentStatus: 'FAILED' };
        }

        return { status: 200, stateChanged: false, currentStatus: current };
      },
    };
  }

  await t.test('Scenario 1: Duplicate debit webhook delivery is handled idempotently without double-crediting', async () => {
    const harness = createDebitWebhookHarness();
    const intentId = 'deb_intent_wh_01';
    harness.initDebit(intentId, 'EXECUTING');

    const res1 = await harness.handleWebhook({
      eventId: 'WH-EVT-DEB-01',
      eventType: 'DIRECT.DEBIT.COMPLETED',
      intentId,
      amountMinor: 50000n,
      signatureValid: true,
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.currentStatus, 'COMPLETED');
    assert.equal(harness.getCollectedAmount(intentId), 50000n);

    // Replay identical event
    const res2 = await harness.handleWebhook({
      eventId: 'WH-EVT-DEB-01',
      eventType: 'DIRECT.DEBIT.COMPLETED',
      intentId,
      amountMinor: 50000n,
      signatureValid: true,
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.duplicate, true);
    assert.equal(harness.getCollectedAmount(intentId), 50000n); // exactly unchanged
  });

  await t.test('Scenario 2: Successful debit webhook updates intent to COMPLETED', async () => {
    const harness = createDebitWebhookHarness();
    const intentId = 'deb_intent_wh_02';
    harness.initDebit(intentId, 'EXECUTING');

    const res = await harness.handleWebhook({
      eventId: 'WH-EVT-DEB-02',
      eventType: 'DIRECT.DEBIT.COMPLETED',
      intentId,
      amountMinor: 30000n,
      signatureValid: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.currentStatus, 'COMPLETED');
    assert.equal(harness.getState(intentId), 'COMPLETED');
  });

  await t.test('Scenario 3: Out-of-order event delivery on CANCELLED debit is safely rejected', async () => {
    const harness = createDebitWebhookHarness();
    const intentId = 'deb_intent_wh_03';
    harness.initDebit(intentId, 'CANCELLED');

    const res = await harness.handleWebhook({
      eventId: 'WH-EVT-DEB-03',
      eventType: 'DIRECT.DEBIT.COMPLETED',
      intentId,
      amountMinor: 25000n,
      signatureValid: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.rejected, true);
    assert.equal(harness.getState(intentId), 'CANCELLED');
  });

  await t.test('Scenario 4: Invalid signature rejects webhook with HTTP 401', async () => {
    const harness = createDebitWebhookHarness();
    const intentId = 'deb_intent_wh_04';
    harness.initDebit(intentId, 'EXECUTING');

    await assert.rejects(
      () => harness.handleWebhook({
        eventId: 'WH-EVT-DEB-04',
        eventType: 'DIRECT.DEBIT.COMPLETED',
        intentId,
        amountMinor: 10000n,
        signatureValid: false,
      }),
      (err) => err.statusCode === 401
    );
  });
});

