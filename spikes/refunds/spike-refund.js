/**
 * spikes/refunds/spike-refund.js
 * Spike 6: Full, partial, over-limit, and currency mismatch refund scenarios
 */

import { getSandboxCredentials } from '../lib/env.js';
import { SpikePayPalClient } from '../lib/paypal-client.js';

export async function runRefundSpike(captureId = 'CAPTURE-MOCK-123') {
  try {
    const creds = getSandboxCredentials();
    const client = new SpikePayPalClient({ ...creds, scenarioId: 'refund-spike' });

    console.log('1. Executing partial refund ($30)...');
    const partialRes = await client.request('POST', `/v2/payments/captures/${captureId}/refund`, {
      amount: { currency_code: 'USD', value: '30.00' },
      note_to_payer: 'Partial return'
    }, {}, 'partial');

    console.log('2. Executing remainder full refund ($70)...');
    const fullRes = await client.request('POST', `/v2/payments/captures/${captureId}/refund`, {
      amount: { currency_code: 'USD', value: '70.00' },
      note_to_payer: 'Full settlement'
    }, {}, 'full');

    return { partialRes, fullRes };
  } catch (err) {
    if (err.code === 'STOP_PROTOCOL_MISSING_CREDENTIALS') {
      console.log('[PROTOKOL BERHENTI]: Kredensial Sandbox belum terpasang di .env.');
    } else {
      console.error('Spike error:', err.message);
    }
  }
}

if (process.argv[1]?.endsWith('spike-refund.js')) {
  runRefundSpike();
}

