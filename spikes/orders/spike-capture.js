/**
 * spikes/orders/spike-capture.js
 * Spike 1: Orders CAPTURE (create -> approve -> capture)
 */

import { getSandboxCredentials } from '../lib/env.js';
import { SpikePayPalClient } from '../lib/paypal-client.js';

export async function runCaptureSpike() {
  try {
    const creds = getSandboxCredentials();
    const client = new SpikePayPalClient({ ...creds, scenarioId: 'order-capture' });

    // 1. Create order intent CAPTURE
    console.log('1. Creating order CAPTURE...');
    const createRes = await client.request('POST', '/v2/checkout/orders', {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'USD', value: '100.00' }
      }]
    }, {}, 'create');

    const orderId = createRes.body.id;
    console.log('Order created:', orderId);

    // 2. Capture (memerlukan buyer approval pada Sandbox riil)
    console.log('2. Capturing order...');
    const captureRes = await client.request('POST', `/v2/checkout/orders/${orderId}/capture`, null, {}, 'capture');
    console.log('Capture status:', captureRes.status);
    return captureRes;
  } catch (err) {
    if (err.code === 'STOP_PROTOCOL_MISSING_CREDENTIALS') {
      console.log('[PROTOKOL BERHENTI]: Kredensial Sandbox belum terpasang di .env.');
    } else {
      console.error('Spike error:', err.message);
    }
  }
}

if (process.argv[1]?.endsWith('spike-capture.js')) {
  runCaptureSpike();
}

