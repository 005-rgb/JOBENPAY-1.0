import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

const requiredEnv = ['PORT', 'PAYPAL_SPIKE_CLIENT_ID', 'PAYPAL_SPIKE_CLIENT_SECRET', 'PAYPAL_SPIKE_WEBHOOK_ID'];

for (const key of requiredEnv) {
  if (!process.env[key] || !process.env[key].trim()) {
    console.error('env belum diisi');
    process.exit(1);
  }
}

const app = express();
const port = Number(process.env.PORT);
const outputDir = path.join(process.cwd(), 'spike-out');

async function getAccessToken() {
  const response = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.PAYPAL_SPIKE_CLIENT_ID}:${process.env.PAYPAL_SPIKE_CLIENT_SECRET}`).toString('base64')}`,
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

app.use(express.raw({ type: '*/*' }));

app.post('/echo', async (req, res) => {
  const timestamp = Date.now();
  const rawBody = req.body?.toString?.() ?? '';
  let parsedBody = {};

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = rawBody;
    }
  }

  const recordedHeaders = {};
  const headerKeys = ['paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time', 'paypal-cert-url', 'paypal-auth-algo'];

  for (const key of headerKeys) {
    const value = req.get(key);
    if (value !== undefined && value !== null) {
      recordedHeaders[key] = value;
    }
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `webhook-${timestamp}.json`);
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        receivedAt: new Date().toISOString(),
        headers: recordedHeaders,
        body: parsedBody,
      },
      null,
      2,
    ),
  );

  const verificationBody = {
    auth_algo: recordedHeaders['paypal-auth-algo'],
    cert_url: recordedHeaders['paypal-cert-url'],
    transmission_id: recordedHeaders['paypal-transmission-id'],
    transmission_time: recordedHeaders['paypal-transmission-time'],
    transmission_sig: recordedHeaders['paypal-transmission-sig'],
    webhook_id: process.env.PAYPAL_SPIKE_WEBHOOK_ID,
    webhook_event: parsedBody,
  };

  let verificationStatus = 'unknown';

  try {
    const accessToken = await getAccessToken();
    const response = await fetch('https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(verificationBody),
      signal: AbortSignal.timeout(20000),
    });

    const json = await response.json().catch(() => ({}));
    verificationStatus = json.verification_status ?? 'unknown';
    console.log('verification_status:', verificationStatus);
  } catch (error) {
    console.error('webhook verification failed');
    if (error instanceof Error) {
      console.error(error.message);
    }
  }

  res.status(200).json({ ok: true, verification_status: verificationStatus });
});

app.listen(port, () => {
  console.log(`webhook echo listening on ${port}`);
});
