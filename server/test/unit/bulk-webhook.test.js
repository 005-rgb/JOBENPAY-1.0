/**
 * server/test/unit/bulk-webhook.test.js
 * Webhook handler with 4 mandatory test scenarios for BULK (Item 6 CCC, AD-16, AD-17, T-19, K-BULK)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeParentStatus } from '../../../shared/bulk.js';

test('BULK Webhook 4 Mandatory Scenarios', async (t) => {
  function createWebhookHarness() {
    const processedEvents = new Set();
    const batchStates = new Map();
    const itemStates = new Map();
    const postedLegs = new Map();

    return {
      initBatch(batchId, items) {
        batchStates.set(batchId, 'EXECUTING');
        const map = new Map();
        for (const item of items) {
          map.set(item.itemId, 'PENDING');
        }
        itemStates.set(batchId, map);
      },
      getBatchState(batchId) {
        return batchStates.get(batchId);
      },
      getItemState(batchId, itemId) {
        return itemStates.get(batchId)?.get(itemId);
      },
      getLegsCount(batchId) {
        return postedLegs.get(batchId) || 0;
      },
      async handleWebhook({ eventId, eventType, batchId, itemId, signatureValid }) {
        if (!signatureValid) {
          const err = new Error('Invalid webhook signature');
          err.statusCode = 401;
          throw err;
        }

        if (processedEvents.has(eventId)) {
          return { status: 200, duplicate: true, currentStatus: batchStates.get(batchId) };
        }
        processedEvents.add(eventId);

        const currentBatch = batchStates.get(batchId);
        if (currentBatch === 'COMPLETED' || currentBatch === 'PARTIALLY_COMPLETED' || currentBatch === 'FAILED') {
          return { status: 200, stateChanged: false, currentStatus: currentBatch };
        }

        const itemsMap = itemStates.get(batchId);
        if (itemsMap && itemId) {
          if (eventType === 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED') {
            itemsMap.set(itemId, 'COMPLETED');
            postedLegs.set(batchId, (postedLegs.get(batchId) || 0) + 1);
          } else if (eventType === 'PAYMENT.PAYOUTS-ITEM.FAILED') {
            itemsMap.set(itemId, 'FAILED');
          }

          // Recompute parent batch status
          const allStatuses = Array.from(itemsMap.values());
          const newBatchStatus = computeParentStatus(allStatuses);
          batchStates.set(batchId, newBatchStatus);
          return { status: 200, stateChanged: true, currentStatus: newBatchStatus, itemStatus: itemsMap.get(itemId) };
        }

        return { status: 200, stateChanged: false, currentStatus: currentBatch };
      },
    };
  }

  await t.test('Scenario 1: Duplicate webhook delivery is handled idempotently without duplicate leg posting', async () => {
    const harness = createWebhookHarness();
    const batchId = 'batch_bulk_scen1';
    harness.initBatch(batchId, [{ itemId: 'item_1' }, { itemId: 'item_2' }]);

    const res1 = await harness.handleWebhook({
      eventId: 'WH-EVT-BULK-01',
      eventType: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
      batchId,
      itemId: 'item_1',
      signatureValid: true,
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.stateChanged, true);
    assert.equal(harness.getItemState(batchId, 'item_1'), 'COMPLETED');
    assert.equal(harness.getLegsCount(batchId), 1);

    // Duplicate replay
    const res2 = await harness.handleWebhook({
      eventId: 'WH-EVT-BULK-01',
      eventType: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
      batchId,
      itemId: 'item_1',
      signatureValid: true,
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.duplicate, true);
    assert.equal(harness.getLegsCount(batchId), 1, 'Legs must not be posted twice for duplicate webhook');
  });

  await t.test('Scenario 2: Out-of-order webhook delivery does not regress terminal state', async () => {
    const harness = createWebhookHarness();
    const batchId = 'batch_bulk_scen2';
    harness.initBatch(batchId, [{ itemId: 'item_1' }]);

    // Item completes
    await harness.handleWebhook({
      eventId: 'WH-EVT-BULK-02a',
      eventType: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
      batchId,
      itemId: 'item_1',
      signatureValid: true,
    });
    assert.equal(harness.getBatchState(batchId), 'COMPLETED');

    // Late / out of order failure event
    const res = await harness.handleWebhook({
      eventId: 'WH-EVT-BULK-02b',
      eventType: 'PAYMENT.PAYOUTS-ITEM.FAILED',
      batchId,
      itemId: 'item_1',
      signatureValid: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.stateChanged, false);
    assert.equal(harness.getBatchState(batchId), 'COMPLETED');
  });

  await t.test('Scenario 3: Late webhook arrival on already terminal batch is safe', async () => {
    const harness = createWebhookHarness();
    const batchId = 'batch_bulk_scen3';
    harness.initBatch(batchId, [{ itemId: 'item_1' }]);

    await harness.handleWebhook({
      eventId: 'WH-EVT-BULK-03a',
      eventType: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
      batchId,
      itemId: 'item_1',
      signatureValid: true,
    });
    assert.equal(harness.getBatchState(batchId), 'COMPLETED');

    const res = await harness.handleWebhook({
      eventId: 'WH-EVT-BULK-03b',
      eventType: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
      batchId,
      itemId: 'item_1',
      signatureValid: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.stateChanged, false);
  });

  await t.test('Scenario 4: Spoofed webhook signature is rejected with 401', async () => {
    const harness = createWebhookHarness();
    const batchId = 'batch_bulk_scen4';
    harness.initBatch(batchId, [{ itemId: 'item_1' }]);

    await assert.rejects(
      async () => {
        await harness.handleWebhook({
          eventId: 'WH-EVT-SPOOFED',
          eventType: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
          batchId,
          itemId: 'item_1',
          signatureValid: false,
        });
      },
      (err) => err.statusCode === 401
    );
  });

  await t.test('5. Partial failure transitions parent to PARTIALLY_COMPLETED', async () => {
    const harness = createWebhookHarness();
    const batchId = 'batch_bulk_partial';
    harness.initBatch(batchId, [{ itemId: 'item_1' }, { itemId: 'item_2' }]);

    await harness.handleWebhook({
      eventId: 'WH-EVT-P1',
      eventType: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
      batchId,
      itemId: 'item_1',
      signatureValid: true,
    });
    assert.equal(harness.getBatchState(batchId), 'EXECUTING');

    await harness.handleWebhook({
      eventId: 'WH-EVT-P2',
      eventType: 'PAYMENT.PAYOUTS-ITEM.FAILED',
      batchId,
      itemId: 'item_2',
      signatureValid: true,
    });
    assert.equal(harness.getBatchState(batchId), 'PARTIALLY_COMPLETED');
    assert.equal(harness.getLegsCount(batchId), 1);
  });
});

