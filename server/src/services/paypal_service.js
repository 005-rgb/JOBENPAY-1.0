// @ts-check
import { env } from '../config.js';

/**
 * Generate environment-isolated PayPal webhook callback URL.
 *
 * @param {'SANDBOX'|'LIVE'|string} environment
 * @param {string} webhookToken
 * @returns {string|null}
 */
export function buildPaypalWebhookUrl(environment = 'SANDBOX', webhookToken) {
  if (!webhookToken) return null;
  const isLive = String(environment || 'SANDBOX').toUpperCase() === 'LIVE';
  const rawBase = (process.env.PUBLIC_BASE_URL || env.PUBLIC_BASE_URL || 'https://nh.jobenapp.cloud')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  const prefix = isLive ? 'live' : 'sbx';
  return `https://${rawBase}/api/v1/webhooks/${prefix}/paypal/${webhookToken}`;
}

export default {
  buildPaypalWebhookUrl,
};
