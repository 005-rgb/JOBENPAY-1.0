/**
 * spikes/payouts/spike-payouts.js
 * Spike 8: Payouts single, batch, and status verification
 */

import { getSandboxCredentials } from '../lib/env.js';
import { SpikePayPalClient } from '../lib/paypal-client.js';

export async function runPayoutsSpike() {
  try {
    const creds = getSandboxCredentials();
    const client = new SpikePayPalClient({ ...creds, scenarioId: 'payouts-spike' });

    console.log('1. Submitting batch payout...');
    const senderBatchId = `jp_spk_${Date.now()}`;
    const payoutRes = await client.request('POST', '/v1/payments/payouts', {
      sender_batch_header: {
        sender_batch_id: senderBatchId,
        email_subject: 'You have a payout!'
      },
      items: [{
        recipient_type: 'EMAIL',
        amount: { value: '25.00', currency: 'USD' },
        receiver: creds.buyerEmail,
        note: 'Sandbox test payout',
        sender_item_id: 'item_1'
      }]
    }, {}, 'batch-create');

    const batchId = payoutRes.body.batch_header?.payout_batch_id;
    console.log('Payout batch submitted:', batchId);
    return payoutRes;
  } catch (err) {
    if (err.code === 'STOP_PROTOCOL_MISSING_CREDENTIALS') {
      console.log('[PROTOKOL BERHENTI]: Kredensial Sandbox belum terpasang di .env.');
    } else {
      console.error('Spike error:', err.message);
    }
  }
}

if (process.argv[1]?.endsWith('spike-payouts.js')) {
  runPayoutsSpike();
}

