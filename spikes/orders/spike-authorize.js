/**
 * spikes/orders/spike-authorize.js
 * Spike 2: Orders AUTHORIZE (create -> approve -> POST /v2/checkout/orders/{id}/authorize)
 */

import { getSandboxCredentials } from '../lib/env.js';
import { SpikePayPalClient } from '../lib/paypal-client.js';

export async function runAuthorizeSpike() {
  try {
    const creds = getSandboxCredentials();
    const client = new SpikePayPalClient({ ...creds, scenarioId: 'order-authorize' });

    console.log('1. Creating order AUTHORIZE...');
    const createRes = await client.request('POST', '/v2/checkout/orders', {
      intent: 'AUTHORIZE',
      purchase_units: [{
        amount: { currency_code: 'USD', value: '250.00' }
      }]
    }, {}, 'create');

    const orderId = createRes.body.id;
    console.log('Order created:', orderId);

    console.log('2. Authorizing order...');
    const authRes = await client.request('POST', `/v2/checkout/orders/${orderId}/authorize`, null, {}, 'authorize');
    console.log('Authorize status:', authRes.status);
    return authRes;
  } catch (err) {
    if (err.code === 'STOP_PROTOCOL_MISSING_CREDENTIALS') {
      console.log('[PROTOKOL BERHENTI]: Kredensial Sandbox belum terpasang di .env.');
    } else {
      console.error('Spike error:', err.message);
    }
  }
}

if (process.argv[1]?.endsWith('spike-authorize.js')) {
  runAuthorizeSpike();
}

