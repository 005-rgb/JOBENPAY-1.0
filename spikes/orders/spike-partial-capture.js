/**
 * spikes/orders/spike-partial-capture.js
 * Spike 3: Multiple partial captures on one authorization
 */

import { getSandboxCredentials } from '../lib/env.js';
import { SpikePayPalClient } from '../lib/paypal-client.js';

export async function runPartialCaptureSpike(authId = 'AUTH-MOCK-123') {
  try {
    const creds = getSandboxCredentials();
    const client = new SpikePayPalClient({ ...creds, scenarioId: 'partial-capture' });

    console.log('1. Capturing partial DP ($50 of $250, final_capture: false)...');
    const part1 = await client.request('POST', `/v2/payments/authorizations/${authId}/capture`, {
      amount: { currency_code: 'USD', value: '50.00' },
      final_capture: false
    }, {}, 'part1');

    console.log('2. Capturing remainder ($200 of $250, final_capture: true)...');
    const part2 = await client.request('POST', `/v2/payments/authorizations/${authId}/capture`, {
      amount: { currency_code: 'USD', value: '200.00' },
      final_capture: true
    }, {}, 'part2');

    return { part1, part2 };
  } catch (err) {
    if (err.code === 'STOP_PROTOCOL_MISSING_CREDENTIALS') {
      console.log('[PROTOKOL BERHENTI]: Kredensial Sandbox belum terpasang di .env.');
    } else {
      console.error('Spike error:', err.message);
    }
  }
}

if (process.argv[1]?.endsWith('spike-partial-capture.js')) {
  runPartialCaptureSpike();
}

