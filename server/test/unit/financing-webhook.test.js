/**
 * server/test/unit/financing-webhook.test.js
 * Webhook handler with 4 mandatory test scenarios for FINANCING (Item 6 CCC, AD-16, AD-17, B-F6)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('FINANCING Webhook 4 Mandatory Scenarios', async (t) => {
  function createFinancingWebhookHarness() {
    const processedEvents = new Set();
    const financingStates = new Map();
    const repayments = new Map();

    return {
      initFinancing(intentId, status = 'DISBURSED', totalObligation = 1000000n) {
        financingStates.set(intentId, status);
        repayments.set(intentId, { repaid: 0n, total: totalObligation, cycles: 0 });
      },
      getState(intentId) {
        return financingStates.get(intentId);
      },
      getRepaidAmount(intentId) {
        return repayments.get(intentId)?.repaid || 0n;
      },
      async handleWebhook({ eventId, eventType, intentId, amountMinor, signatureValid }) {
        if (!signatureValid) {
          const err = new Error('Invalid webhook signature');
          err.statusCode = 401;
          throw err;
        }

        if (processedEvents.has(eventId)) {
          return { status: 200, duplicate: true, currentStatus: financingStates.get(intentId) };
        }
        processedEvents.add(eventId);

        const current = financingStates.get(intentId);
        const fin = repayments.get(intentId);

        if (eventType === 'FINANCING.DISBURSEMENT.COMPLETED') {
          if (current !== 'APPROVED') {
            return { status: 200, stateChanged: false, currentStatus: current, outOfOrder: true };
          }
          financingStates.set(intentId, 'DISBURSED');
          return { status: 200, stateChanged: true, currentStatus: 'DISBURSED' };
        }

        if (eventType === 'FINANCING.REPAYMENT.RECEIVED') {
          if (current !== 'DISBURSED' && current !== 'REPAYING') {
            return { status: 200, stateChanged: false, currentStatus: current, rejected: true };
          }
          const amt = BigInt(amountMinor || 0);
          fin.repaid += amt;
          fin.cycles += 1;
          if (fin.repaid >= fin.total) {
            financingStates.set(intentId, 'SETTLED');
            return { status: 200, stateChanged: true, currentStatus: 'SETTLED', fullySettled: true };
          }
          financingStates.set(intentId, 'REPAYING');
          return { status: 200, stateChanged: true, currentStatus: 'REPAYING', cycleNumber: fin.cycles };
        }

        if (eventType === 'FINANCING.FACILITY.DEFAULTED') {
          financingStates.set(intentId, 'DEFAULTED');
          return { status: 200, stateChanged: true, currentStatus: 'DEFAULTED' };
        }

        return { status: 200, stateChanged: false, currentStatus: current };
      },
    };
  }

  await t.test('Scenario 1: Duplicate financing webhook delivery is handled idempotently without double-repayment', async () => {
    const harness = createFinancingWebhookHarness();
    const intentId = 'fin_intent_wh_01';
    harness.initFinancing(intentId, 'DISBURSED', 1000000n);

    const res1 = await harness.handleWebhook({
      eventId: 'WH-EVT-FIN-01',
      eventType: 'FINANCING.REPAYMENT.RECEIVED',
      intentId,
      amountMinor: 250000n,
      signatureValid: true,
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.cycleNumber, 1);
    assert.equal(harness.getRepaidAmount(intentId), 250000n);

    // Replay identical event
    const res2 = await harness.handleWebhook({
      eventId: 'WH-EVT-FIN-01',
      eventType: 'FINANCING.REPAYMENT.RECEIVED',
      intentId,
      amountMinor: 250000n,
      signatureValid: true,
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.duplicate, true);
    assert.equal(harness.getRepaidAmount(intentId), 250000n); // exactly unchanged
  });

  await t.test('Scenario 2: Final repayment webhook triggers facility settlement (SETTLED)', async () => {
    const harness = createFinancingWebhookHarness();
    const intentId = 'fin_intent_wh_02';
    harness.initFinancing(intentId, 'REPAYING', 500000n);

    const res = await harness.handleWebhook({
      eventId: 'WH-EVT-FIN-02',
      eventType: 'FINANCING.REPAYMENT.RECEIVED',
      intentId,
      amountMinor: 500000n,
      signatureValid: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.currentStatus, 'SETTLED');
    assert.equal(res.fullySettled, true);
    assert.equal(harness.getState(intentId), 'SETTLED');
  });

  await t.test('Scenario 3: Out-of-order event delivery is safely rejected without illegal state transition', async () => {
    const harness = createFinancingWebhookHarness();
    const intentId = 'fin_intent_wh_03';
    harness.initFinancing(intentId, 'SETTLED', 500000n);

    // Attempting repayment on an already SETTLED facility
    const res = await harness.handleWebhook({
      eventId: 'WH-EVT-FIN-03',
      eventType: 'FINANCING.REPAYMENT.RECEIVED',
      intentId,
      amountMinor: 100000n,
      signatureValid: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.rejected, true);
    assert.equal(harness.getState(intentId), 'SETTLED');
  });

  await t.test('Scenario 4: Invalid signature rejects webhook with HTTP 401', async () => {
    const harness = createFinancingWebhookHarness();
    const intentId = 'fin_intent_wh_04';
    harness.initFinancing(intentId, 'DISBURSED', 1000000n);

    await assert.rejects(
      () => harness.handleWebhook({
        eventId: 'WH-EVT-FIN-04',
        eventType: 'FINANCING.REPAYMENT.RECEIVED',
        intentId,
        amountMinor: 250000n,
        signatureValid: false, // Invalid signature
      }),
      (err) => err.statusCode === 401
    );
  });
});

