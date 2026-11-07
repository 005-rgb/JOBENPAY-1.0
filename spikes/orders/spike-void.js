/**
 * spikes/orders/spike-void.js
 * Spike 5: Void authorization
 */

import { getSandboxCredentials } from '../lib/env.js';
import { SpikePayPalClient } from '../lib/paypal-client.js';

export async function runVoidSpike(authId = 'AUTH-MOCK-123') {
  try {
    const creds = getSandboxCredentials();
    const client = new SpikePayPalClient({ ...creds, scenarioId: 'void-auth' });

    console.log('1. Voiding uncaptured authorization...');
    const res = await client.request('POST', `/v2/payments/authorizations/${authId}/void`, null, {}, 'void');
    return res;
  } catch (err) {
    if (err.code === 'STOP_PROTOCOL_MISSING_CREDENTIALS') {
      console.log('[PROTOKOL BERHENTI]: Kredensial Sandbox belum terpasang di .env.');
    } else {
      console.error('Spike error:', err.message);
    }
  }
}

if (process.argv[1]?.endsWith('spike-void.js')) {
  runVoidSpike();
}

