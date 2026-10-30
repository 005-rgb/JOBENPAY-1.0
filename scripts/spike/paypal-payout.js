import { randomUUID } from 'node:crypto';

const requiredEnv = ['PAYPAL_SPIKE_CLIENT_ID', 'PAYPAL_SPIKE_CLIENT_SECRET', 'PAYPAL_SPIKE_RECEIVER_EMAIL'];

for (const key of requiredEnv) {
  if (!process.env[key] || !process.env[key].trim()) {
    console.error('env belum diisi');
    process.exit(1);
  }
}

const baseUrl = 'https://api-m.sandbox.paypal.com';
const clientId = process.env.PAYPAL_SPIKE_CLIENT_ID;
const clientSecret = process.env.PAYPAL_SPIKE_CLIENT_SECRET;
const receiverEmail = process.env.PAYPAL_SPIKE_RECEIVER_EMAIL;

async function getAccessToken() {
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`oauth failed: ${response.status}`);
  }

  const payload = await response.json();
  return payload.access_token;
}

async function main() {
  const accessToken = await getAccessToken();
  const requestId = randomUUID();
  const senderBatchId = `spike_${Date.now()}`;

  const payoutResponse = await fetch(`${baseUrl}/v1/payments/payouts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': requestId,
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: senderBatchId,
        email_message: 'JOBENPAY spike payout test',
        recipient_type: 'EMAIL',
        note: 'Sandbox payout validation',
      },
      items: [
        {
          recipient_type: 'EMAIL',
          amount: {
            value: '1.00',
            currency: 'USD',
          },
          note: 'USD 1.00 test payout',
          receiver: receiverEmail,
          sender_item_id: `item_${Date.now()}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });

  const payoutJson = await payoutResponse.json().catch(() => ({}));

  console.log('batch_status:', payoutJson.batch_status ?? 'unknown');
  console.log('payout_batch_id:', payoutJson.payout_batch_id ?? 'unknown');

  if (!payoutJson.payout_batch_id || !payoutResponse.ok) {
    console.error('payout request failed');
    process.exit(1);
  }

  const detailsResponse = await fetch(`${baseUrl}/v1/payments/payouts/${payoutJson.payout_batch_id}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(20000),
  });

  const detailsJson = await detailsResponse.json().catch(() => ({}));
  const items = Array.isArray(detailsJson.items) ? detailsJson.items : [];

  console.log(
    'item_status:',
    items.map((item) => ({
      payout_item_id: item.payout_item_id,
      payout_item_status: item.payout_item_status,
      transaction_id: item.transaction_id ?? null,
    })),
  );

  if (!detailsResponse.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('payout request failed');
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exit(1);
});
