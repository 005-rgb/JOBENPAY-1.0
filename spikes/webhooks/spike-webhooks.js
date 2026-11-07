/**
 * spikes/webhooks/spike-webhooks.js
 * Spike 11: Webhooks registration and signature verification
 */

import { getSandboxCredentials } from '../lib/env.js';
import { SpikePayPalClient } from '../lib/paypal-client.js';

export async function runWebhooksSpike() {
  try {
    const creds = getSandboxCredentials();
    const client = new SpikePayPalClient({ ...creds, scenarioId: 'webhooks-spike' });

    console.log('1. Listing registered webhooks...');
    const listRes = await client.request('GET', '/v1/notifications/webhooks', null, {}, 'list');
    return listRes;
  } catch (err) {
    if (err.code === 'STOP_PROTOCOL_MISSING_CREDENTIALS') {
      console.log('[PROTOKOL BERHENTI]: Kredensial Sandbox belum terpasang di .env.');
    } else {
      console.error('Spike error:', err.message);
    }
  }
}

if (process.argv[1]?.endsWith('spike-webhooks.js')) {
  runWebhooksSpike();
}

