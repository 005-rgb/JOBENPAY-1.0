/**
 * spikes/invoices/spike-invoicing.js
 * Spike 7: Invoicing lifecycle (create -> send -> pay / cancel)
 */

import { getSandboxCredentials } from '../lib/env.js';
import { SpikePayPalClient } from '../lib/paypal-client.js';

export async function runInvoicingSpike() {
  try {
    const creds = getSandboxCredentials();
    const client = new SpikePayPalClient({ ...creds, scenarioId: 'invoice-lifecycle' });

    console.log('1. Creating draft invoice...');
    const createRes = await client.request('POST', '/v2/invoicing/invoices', {
      detail: {
        currency_code: 'USD',
        invoice_number: `INV-SPK-${Date.now()}`,
        invoice_date: '2026-11-06'
      },
      primary_recipients: [{
        billing_info: { email_address: creds.buyerEmail }
      }],
      items: [{
        name: 'Consulting Services',
        quantity: '1',
        unit_amount: { currency_code: 'USD', value: '150.00' }
      }]
    }, {}, 'create');

    const invId = createRes.body.id;
    console.log('Invoice created:', invId);

    console.log('2. Sending invoice...');
    const sendRes = await client.request('POST', `/v2/invoicing/invoices/${invId}/send`, {
      send_to_recipient: true
    }, {}, 'send');

    return { createRes, sendRes };
  } catch (err) {
    if (err.code === 'STOP_PROTOCOL_MISSING_CREDENTIALS') {
      console.log('[PROTOKOL BERHENTI]: Kredensial Sandbox belum terpasang di .env.');
    } else {
      console.error('Spike error:', err.message);
    }
  }
}

if (process.argv[1]?.endsWith('spike-invoicing.js')) {
  runInvoicingSpike();
}

