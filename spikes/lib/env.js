/**
 * spikes/lib/env.js
 * Pengecekan kredensial Sandbox sesuai protokol berhenti F0-2.
 */

export function getSandboxCredentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    const error = new Error('PAYPAL_CREDENTIALS_MISSING: PAYPAL_CLIENT_ID dan PAYPAL_CLIENT_SECRET tidak ditemukan di env.');
    error.code = 'STOP_PROTOCOL_MISSING_CREDENTIALS';
    throw error;
  }

  return {
    clientId,
    clientSecret,
    buyerEmail: process.env.SANDBOX_BUYER_EMAIL || 'buyer-sandbox@jobenpay.test',
    buyerPassword: process.env.SANDBOX_BUYER_PASSWORD || 'Secret123!'
  };
}

