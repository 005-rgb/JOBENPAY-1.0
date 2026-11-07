/**
 * fake-paypal/scenarios/disputes.scenario.js
 * Skenario stateful untuk Customer Disputes API v1.
 */

import { randomUUID } from 'node:crypto';

export class DisputesScenario {
  constructor(store) {
    this.store = store;
    this.seedDefaultDisputes();
  }

  seedDefaultDisputes() {
    const disputeId = 'DISPUTE-SANDBOX-001';
    this.store.disputes.set(disputeId, {
      dispute_id: disputeId,
      create_time: new Date().toISOString(),
      update_time: new Date().toISOString(),
      dispute_amount: {
        currency_code: 'USD',
        value: '75.00'
      },
      reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
      status: 'OPEN',
      dispute_state: 'REQUIRED_ACTION',
      dispute_life_cycle_stage: 'CHARGEBACK',
      disputed_transactions: [
        {
          seller_transaction_id: 'TXN-DISPUTE-001',
          create_time: new Date().toISOString(),
          transaction_status: 'COMPLETED',
          gross_amount: { currency_code: 'USD', value: '75.00' }
        }
      ]
    });
  }

  listDisputes() {
    const items = Array.from(this.store.disputes.values());
    return {
      status: 200,
      body: {
        items,
        links: [
          {
            href: 'https://api-m.sandbox.paypal.com/v1/customer/disputes',
            rel: 'self',
            method: 'GET'
          }
        ]
      }
    };
  }

  getDispute(id) {
    const dispute = this.store.disputes.get(id);
    if (!dispute) return { status: 404, body: { name: 'RESOURCE_NOT_FOUND', message: 'Dispute not found' } };
    return { status: 200, body: dispute };
  }

  acceptClaim(id, payload) {
    const dispute = this.store.disputes.get(id);
    if (!dispute) return { status: 404, body: { name: 'RESOURCE_NOT_FOUND', message: 'Dispute not found' } };

    dispute.status = 'RESOLVED';
    dispute.dispute_state = 'RESOLVED';
    dispute.update_time = new Date().toISOString();
    return { status: 200, body: dispute };
  }

  provideEvidence(id, payload) {
    const dispute = this.store.disputes.get(id);
    if (!dispute) return { status: 404, body: { name: 'RESOURCE_NOT_FOUND', message: 'Dispute not found' } };

    dispute.status = 'UNDER_REVIEW';
    dispute.dispute_state = 'UNDER_REVIEW';
    dispute.update_time = new Date().toISOString();
    return { status: 200, body: dispute };
  }
}

