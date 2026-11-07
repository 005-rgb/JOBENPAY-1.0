/**
 * spikes/orders/spike-reauthorize.js
 * Spike 4: Re-authorize authorization
 */

import { getSandboxCredentials } from '../lib/env.js';
import { SpikePayPalClient } from '../lib/paypal-client.js';

export async function runReauthorizeSpike(authId = 'AUTH-MOCK-123') {
  try {
    const creds = getSandboxCredentials();
    const client = new SpikePayPalClient({ ...creds, scenarioId: 'reauthorize' });

    console.log('1. Re-authorizing hold...');
    const res = await client.request('POST', `/v2/payments/authorizations/${authId}/reauthorize`, {
      amount: { currency_code: 'USD', value: '250.00' }
    }, {}, 'reauth');

    return res;
  } catch (err) {
    if (err.code === 'STOP_PROTOCOL_MISSING_CREDENTIALS') {
      console.log('[PROTOKOL BERHENTI]: Kredensial Sandbox belum terpasang di .env.');
    } else {
      console.error('Spike error:', err.message);
    }
  }
}

if (process.argv[1]?.endsWith('spike-reauthorize.js')) {
  runReauthorizeSpike();
}

