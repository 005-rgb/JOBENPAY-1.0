/**
 * spikes/subscriptions/spike-subscriptions.js
 * Spike 9: Subscriptions product -> plan -> subscription lifecycle
 */

import { getSandboxCredentials } from '../lib/env.js';
import { SpikePayPalClient } from '../lib/paypal-client.js';

export async function runSubscriptionsSpike() {
  try {
    const creds = getSandboxCredentials();
    const client = new SpikePayPalClient({ ...creds, scenarioId: 'subscriptions-spike' });

    console.log('1. Creating catalog product...');
    const prodRes = await client.request('POST', '/v1/catalogs/products', {
      name: 'Agent Economy Plan',
      type: 'SERVICE',
      category: 'SOFTWARE'
    }, {}, 'prod-create');

    const productId = prodRes.body.id;
    console.log('Product created:', productId);

    console.log('2. Creating billing plan...');
    const planRes = await client.request('POST', '/v1/billing/plans', {
      product_id: productId,
      name: 'Monthly Tier 1',
      billing_cycles: [{
        frequency: { interval_unit: 'MONTH', interval_count: 1 },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 12,
        pricing_scheme: {
          fixed_price: { value: '50.00', currency_code: 'USD' }
        }
      }],
      payment_preferences: {
        auto_bill_outstanding: true
      }
    }, {}, 'plan-create');

    return { prodRes, planRes };
  } catch (err) {
    if (err.code === 'STOP_PROTOCOL_MISSING_CREDENTIALS') {
      console.log('[PROTOKOL BERHENTI]: Kredensial Sandbox belum terpasang di .env.');
    } else {
      console.error('Spike error:', err.message);
    }
  }
}

if (process.argv[1]?.endsWith('spike-subscriptions.js')) {
  runSubscriptionsSpike();
}

