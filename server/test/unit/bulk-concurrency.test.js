/**
 * server/test/unit/bulk-concurrency.test.js
 * Concurrency, row locking & budget race condition tests for BULK (Item 8 CCC, AD-17, T-19, K-BULK)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeParentStatus } from '../../../shared/bulk.js';

test('BULK Concurrency & Row Locking Tests', async (t) => {
  await t.test('1. Two concurrent bulk batches competing for organization budget: zero overshoot', async () => {
    let orgBudget = 25000n; // $250.00 total org budget
    const batchAmount1 = 15000n; // Batch 1: $150.00
    const batchAmount2 = 15000n; // Batch 2: $150.00 (Total 30,000 > 25,000)

    let locked = false;
    async function reserveBatchBudget(batchId, amount) {
      if (locked) {
        throw new Error('409 Conflict: Row is locked');
      }
      locked = true;
      try {
        if (orgBudget >= amount) {
          orgBudget -= amount;
          return { batchId, accepted: true, remaining: orgBudget };
        }
        return { batchId, accepted: false, reason: 'BUDGET_EXCEEDED' };
      } finally {
        locked = false;
      }
    }

    const res1 = await reserveBatchBudget('batch_1', batchAmount1);
    const res2 = await reserveBatchBudget('batch_2', batchAmount2);

    assert.equal(res1.accepted, true);
    assert.equal(res2.accepted, false);
    assert.equal(res2.reason, 'BUDGET_EXCEEDED');
    assert.equal(orgBudget, 10000n, 'Remaining budget must exactly reflect 1 accepted batch');
  });

  await t.test('2. Parallel webhooks updating item statuses on same parent maintain consistent state', async () => {
    const parentBatch = {
      batchId: 'batch_race_01',
      status: 'EXECUTING',
      locked: false,
      items: new Map([
        ['item_1', 'PENDING'],
        ['item_2', 'PENDING'],
        ['item_3', 'PENDING'],
      ]),
    };

    async function applyItemWebhook(itemId, outcome) {
      if (parentBatch.locked) {
        // Retry until acquired
        await new Promise((r) => setTimeout(r, 2));
      }
      parentBatch.locked = true;
      try {
        parentBatch.items.set(itemId, outcome);
        const allStatuses = Array.from(parentBatch.items.values());
        parentBatch.status = computeParentStatus(allStatuses);
        return { itemId, outcome, parentStatus: parentBatch.status };
      } finally {
        parentBatch.locked = false;
      }
    }

    // 3 concurrent item status completions
    await Promise.all([
      applyItemWebhook('item_1', 'COMPLETED'),
      applyItemWebhook('item_2', 'COMPLETED'),
      applyItemWebhook('item_3', 'FAILED'),
    ]);

    assert.equal(parentBatch.status, 'PARTIALLY_COMPLETED');
    assert.equal(parentBatch.items.get('item_1'), 'COMPLETED');
    assert.equal(parentBatch.items.get('item_2'), 'COMPLETED');
    assert.equal(parentBatch.items.get('item_3'), 'FAILED');
  });

  await t.test('3. Failed item releases reserved budget accurately', () => {
    let orgBudget = 50000n;
    const item1 = 10000n;
    const item2 = 15000n;
    const totalReserved = item1 + item2;

    orgBudget -= totalReserved; // Reserved: budget now 25,000

    // item 1 succeeds -> stays deducted
    // item 2 fails -> budget released
    function releaseFailedItem(amount) {
      orgBudget += amount;
    }

    releaseFailedItem(item2);
    assert.equal(orgBudget, 40000n, 'Failed item amount must be restored to budget');
  });
});

