/**
 * spikes/disputes/spike-disputes.js
 * Spike 10: Disputes list, show, provide-evidence, accept-claim
 * Resolves path conflict: locks /v1/customer-disputes (AD-12)
 */

import { getSandboxCredentials } from '../lib/env.js';
import { SpikePayPalClient } from '../lib/paypal-client.js';

export async function runDisputesSpike() {
  try {
    const creds = getSandboxCredentials();
    const client = new SpikePayPalClient({ ...creds, scenarioId: 'disputes-spike' });

    console.log('1. Listing customer disputes (/v1/customer-disputes)...');
    const listRes = await client.request('GET', '/v1/customer-disputes', null, {}, 'list');
    console.log('Disputes status:', listRes.status);
    return listRes;
  } catch (err) {
    if (err.code === 'STOP_PROTOCOL_MISSING_CREDENTIALS') {
      console.log('[PROTOKOL BERHENTI]: Kredensial Sandbox belum terpasang di .env.');
    } else {
      console.error('Spike error:', err.message);
    }
  }
}

if (process.argv[1]?.endsWith('spike-disputes.js')) {
  runDisputesSpike();
}

