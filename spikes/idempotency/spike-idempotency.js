/**
 * spikes/idempotency/spike-idempotency.js
 * Spike 12: PayPal-Request-Id header idempotency behavior
 */

import { getSandboxCredentials } from '../lib/env.js';
import { SpikePayPalClient } from '../lib/paypal-client.js';

export async function runIdempotencySpike() {
  try {
    const creds = getSandboxCredentials();
    const client = new SpikePayPalClient({ ...creds, scenarioId: 'idempotency-spike' });

    const reqId = `jp_test_${Date.now()}`;
    console.log('1. First call with PayPal-Request-Id:', reqId);
    const firstCall = await client.request('POST', '/v2/checkout/orders', {
      intent: 'CAPTURE',
      purchase_units: [{ amount: { currency_code: 'USD', value: '10.00' } }]
    }, { 'PayPal-Request-Id': reqId }, 'first-call');

    console.log('2. Second identical call with same PayPal-Request-Id...');
    const secondCall = await client.request('POST', '/v2/checkout/orders', {
      intent: 'CAPTURE',
      purchase_units: [{ amount: { currency_code: 'USD', value: '10.00' } }]
    }, { 'PayPal-Request-Id': reqId }, 'second-identical');

    return { firstCall, secondCall };
  } catch (err) {
    if (err.code === 'STOP_PROTOCOL_MISSING_CREDENTIALS') {
      console.log('[PROTOKOL BERHENTI]: Kredensial Sandbox belum terpasang di .env.');
    } else {
      console.error('Spike error:', err.message);
    }
  }
}

if (process.argv[1]?.endsWith('spike-idempotency.js')) {
  runIdempotencySpike();
}

