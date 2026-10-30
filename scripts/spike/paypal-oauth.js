import { Buffer } from 'node:buffer';

const requiredEnv = ['PAYPAL_SPIKE_CLIENT_ID', 'PAYPAL_SPIKE_CLIENT_SECRET'];

for (const key of requiredEnv) {
  if (!process.env[key] || !process.env[key].trim()) {
    console.error('env belum diisi');
    process.exit(1);
  }
}

const clientId = process.env.PAYPAL_SPIKE_CLIENT_ID;
const clientSecret = process.env.PAYPAL_SPIKE_CLIENT_SECRET;
const baseUrl = 'https://api-m.sandbox.paypal.com';

const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 15000);

try {
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
    signal: controller.signal,
  });

  const rawText = await response.text();
  let payload;

  try {
    payload = JSON.parse(rawText);
  } catch {
    payload = { raw: rawText.slice(0, 200) };
  }

  const safePayload = payload && typeof payload === 'object' ? { ...payload } : {};
  delete safePayload.access_token;

  console.log(`status: ${response.status}`);
  console.log('response:', safePayload);

  if (!response.ok) {
    process.exit(1);
  }
} catch (error) {
  console.error('oauth request failed');
  if (error instanceof Error && error.name === 'AbortError') {
    console.error('timeout');
  } else if (error instanceof Error) {
    console.error(error.message);
  }
  process.exit(1);
} finally {
  clearTimeout(timeoutId);
}
