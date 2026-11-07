/**
 * fake-paypal/scenarios/payout.scenario.js
 * Skenario stateful untuk PayPal Payouts API v1.
 */

import { randomUUID } from 'node:crypto';

export class PayoutScenario {
  constructor(store) {
    this.store = store;
  }

  createBatch(payload, headers = {}) {
    const senderBatchHeader = payload?.sender_batch_header || {};
    const senderBatchId = senderBatchHeader.sender_batch_id || `batch_${randomUUID()}`;
    const items = payload?.items || [];

    // Cek duplikasi sender_batch_id untuk idempotensi
    if (this.store.payoutsBySenderBatchId.has(senderBatchId)) {
      const existing = this.store.payoutsBySenderBatchId.get(senderBatchId);
      return {
        status: 400,
        body: {
          name: 'DUPLICATE_RESOURCE_IDENTIFIER',
          message: `The value of sender_batch_id '${senderBatchId}' has already been used`,
          information_link: 'https://developer.paypal.com/docs/api/payments.payouts-batch/#errors'
        }
      };
    }

    const batchId = `BATCH-${randomUUID().substring(0, 10).toUpperCase()}`;
    const batchItems = items.map((it, idx) => {
      const itemId = `ITEM-${randomUUID().substring(0, 8).toUpperCase()}`;
      const itemRecord = {
        payout_item_id: itemId,
        transaction_id: `TXN-${randomUUID().substring(0, 8).toUpperCase()}`,
        activity_id: `ACT-${randomUUID().substring(0, 8).toUpperCase()}`,
        transaction_status: 'SUCCESS',
        payout_item_fee: {
          currency: it.amount?.currency || 'USD',
          value: '0.25'
        },
        payout_batch_id: batchId,
        payout_item: it,
        time_processed: new Date().toISOString()
      };
      this.store.payoutItems.set(itemId, itemRecord);
      return itemRecord;
    });

    const totalAmount = items.reduce((sum, it) => sum + parseFloat(it.amount?.value || 0), 0).toFixed(2);
    const currency = items[0]?.amount?.currency || 'USD';

    const batchRecord = {
      batch_header: {
        payout_batch_id: batchId,
        batch_status: 'SUCCESS',
        time_created: new Date().toISOString(),
        time_completed: new Date().toISOString(),
        sender_batch_header: senderBatchHeader,
        amount: {
          currency,
          value: totalAmount
        },
        fees: {
          currency,
          value: (items.length * 0.25).toFixed(2)
        }
      },
      items: batchItems
    };

    this.store.payouts.set(batchId, batchRecord);
    this.store.payoutsBySenderBatchId.set(senderBatchId, batchRecord);

    return {
      status: 201,
      body: {
        batch_header: batchRecord.batch_header,
        links: [
          {
            href: `https://api-m.sandbox.paypal.com/v1/payments/payouts/${batchId}`,
            rel: 'self',
            method: 'GET'
          }
        ]
      }
    };
  }

  getBatch(batchId) {
    const batch = this.store.payouts.get(batchId);
    if (!batch) return { status: 404, body: { name: 'RESOURCE_NOT_FOUND', message: 'Payout batch not found' } };
    return { status: 200, body: batch };
  }

  getItem(itemId) {
    const item = this.store.payoutItems.get(itemId);
    if (!item) return { status: 404, body: { name: 'RESOURCE_NOT_FOUND', message: 'Payout item not found' } };
    return { status: 200, body: item };
  }
}

