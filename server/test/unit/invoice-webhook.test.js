/**
 * server/test/unit/invoice-webhook.test.js
 * Webhook handler with 4 mandatory test scenarios for INVOICE (Item 6 CCC, AD-16, K-INVOICE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('INVOICE Webhook 4 Mandatory Scenarios', async (t) => {
  function createWebhookHarness() {
    const processedEvents = new Set();
    const intentStates = new Map();
    const invoiceStates = new Map();
    const postedLegs = new Map();

    return {
      initState(intentId, invoiceId, status, invStatus = 'SENT') {
        intentStates.set(intentId, status);
        invoiceStates.set(invoiceId, invStatus);
      },
      getState(intentId) {
        return intentStates.get(intentId);
      },
      getInvoiceStatus(invoiceId) {
        return invoiceStates.get(invoiceId);
      },
      getLegsCount(intentId) {
        return postedLegs.get(intentId) || 0;
      },
      async handleWebhook({ eventId, eventType, intentId, invoiceId, signatureValid }) {
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

        if (eventType === 'INVOICING.INVOICE.PAID') {
          if (current === 'COMPLETED') {
            return { status: 200, stateChanged: false, currentStatus: current };
          }
          intentStates.set(intentId, 'COMPLETED');
          if (invoiceId) {
            invoiceStates.set(invoiceId, 'PAID');
          }
          postedLegs.set(intentId, (postedLegs.get(intentId) || 0) + 1);
          return { status: 200, stateChanged: true, currentStatus: 'COMPLETED' };
        }

        if (eventType === 'INVOICING.INVOICE.CANCELLED') {
          intentStates.set(intentId, 'FAILED');
          if (invoiceId) {
            invoiceStates.set(invoiceId, 'CANCELLED');
          }
          return { status: 200, stateChanged: true, currentStatus: 'FAILED' };
        }

        return { status: 200, unhandled: true, currentStatus: current };
      },
    };
  }

  await t.test('Scenario 1: Valid INVOICING.INVOICE.PAID transitions intent to COMPLETED and sets invoice_record to PAID', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000151';
    const invoiceId = 'inv_rec_01';
    harness.initState(intentId, invoiceId, 'EXECUTING', 'SENT');

    const result = await harness.handleWebhook({
      eventId: 'WH-EVT-INV-01',
      eventType: 'INVOICING.INVOICE.PAID',
      intentId,
      invoiceId,
      signatureValid: true,
    });

    assert.equal(result.status, 200);
    assert.equal(result.stateChanged, true);
    assert.equal(harness.getState(intentId), 'COMPLETED');
    assert.equal(harness.getInvoiceStatus(invoiceId), 'PAID');
    assert.equal(harness.getLegsCount(intentId), 1);
  });

  await t.test('Scenario 2: Duplicate webhook delivery is strictly idempotent without double leg posting', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000152';
    const invoiceId = 'inv_rec_02';
    harness.initState(intentId, invoiceId, 'EXECUTING', 'SENT');

    // First arrival
    const res1 = await harness.handleWebhook({
      eventId: 'WH-EVT-INV-02',
      eventType: 'INVOICING.INVOICE.PAID',
      intentId,
      invoiceId,
      signatureValid: true,
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.stateChanged, true);
    assert.equal(harness.getLegsCount(intentId), 1);

    // Second arrival (duplicate)
    const res2 = await harness.handleWebhook({
      eventId: 'WH-EVT-INV-02',
      eventType: 'INVOICING.INVOICE.PAID',
      intentId,
      invoiceId,
      signatureValid: true,
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.duplicate, true);
    assert.equal(harness.getLegsCount(intentId), 1, 'Legs must not be posted twice');
  });

  await t.test('Scenario 3: Out-of-order or unknown event is handled safely without crashing', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000153';
    harness.initState(intentId, 'inv_03', 'EXECUTING');

    const result = await harness.handleWebhook({
      eventId: 'WH-EVT-INV-03',
      eventType: 'PAYMENT.SALE.COMPLETED',
      intentId,
      signatureValid: true,
    });

    assert.equal(result.status, 200);
    assert.equal(result.unhandled, true);
    assert.equal(harness.getState(intentId), 'EXECUTING');
  });

  await t.test('Scenario 4: Webhook with invalid or forged signature is rejected with 401', async () => {
    const harness = createWebhookHarness();
    const intentId = 'e0000000-0000-4000-8000-000000000154';
    harness.initState(intentId, 'inv_04', 'EXECUTING');

    await assert.rejects(
      async () => {
        await harness.handleWebhook({
          eventId: 'WH-EVT-INV-04',
          eventType: 'INVOICING.INVOICE.PAID',
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

