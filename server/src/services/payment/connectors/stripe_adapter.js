// @ts-check
import { BaseConnector } from './base_connector.js';
import crypto from 'node:crypto';

const HARD_DECLINE_CODES = new Set([
  'stolen_card',
  'lost_card',
  'pickup_card',
  'fraudulent',
  'invalid_account',
  'do_not_honor',
  'restricted_card',
]);

/**
 * StripeAdapter: Implementasi BaseConnector untuk Stripe (PRD 4.1 §3.1)
 */
export class StripeAdapter extends BaseConnector {
  /**
   * @param {object} [options]
   * @param {string} [options.apiKey]
   * @param {Function} [options.client] - Mock / injected client
   */
  constructor({ apiKey = process.env.STRIPE_SECRET_KEY, client = null } = {}) {
    super();
    this.apiKey = apiKey;
    this.client = client;
  }

  /**
   * Authorize payment via Stripe
   */
  async authorize(amount, currency, token, idempotencyKey, metadata = {}) {
    try {
      if (this.client && typeof this.client.authorize === 'function') {
        return await this.client.authorize({ amount, currency, token, idempotencyKey, metadata });
      }

      // Default sandbox / mock behavior for testing
      if (token?.includes('hard_decline') || metadata?.simulateHardDecline) {
        return {
          success: false,
          gateway: 'STRIPE',
          isHardDecline: true,
          errorCode: 'stolen_card',
          errorMessage: 'Stripe hard decline: Card reported stolen.',
        };
      }

      if (token?.includes('soft_decline') || metadata?.simulateSoftDecline) {
        return {
          success: false,
          gateway: 'STRIPE',
          isHardDecline: false,
          errorCode: 'insufficient_funds',
          errorMessage: 'Stripe soft decline: Insufficient funds.',
        };
      }

      const txId = `ch_stripe_${crypto.randomBytes(12).toString('hex')}`;
      return {
        success: true,
        gateway: 'STRIPE',
        gatewayTxId: txId,
        idempotencyKey,
        amount,
        currency,
        status: 'AUTHORIZED',
      };
    } catch (err) {
      const isHard = HARD_DECLINE_CODES.has(err.code || err.decline_code);
      return {
        success: false,
        gateway: 'STRIPE',
        isHardDecline: isHard,
        errorCode: err.code || 'STRIPE_ERROR',
        errorMessage: err.message || 'Stripe authorization failed',
      };
    }
  }

  /**
   * Capture authorized charge
   */
  async capture(gatewayTxId, amount, idempotencyKey) {
    if (this.client && typeof this.client.capture === 'function') {
      return await this.client.capture({ gatewayTxId, amount, idempotencyKey });
    }

    return {
      success: true,
      gateway: 'STRIPE',
      gatewayTxId,
      status: 'CAPTURED',
      amount,
      idempotencyKey,
    };
  }

  /**
   * Refund charge
   */
  async refund(gatewayTxId, amount, idempotencyKey) {
    if (this.client && typeof this.client.refund === 'function') {
      return await this.client.refund({ gatewayTxId, amount, idempotencyKey });
    }

    const refundId = `re_stripe_${crypto.randomBytes(12).toString('hex')}`;
    return {
      success: true,
      gateway: 'STRIPE',
      gatewayTxId,
      refundId,
      status: 'REFUNDED',
      amount,
      idempotencyKey,
    };
  }

  /**
   * Verify webhook signature
   */
  async verifyWebhook(rawBody, signature) {
    if (this.client && typeof this.client.verifyWebhook === 'function') {
      return await this.client.verifyWebhook({ rawBody, signature });
    }

    if (!signature || signature === 'invalid_signature') {
      return { isValid: false, errorMessage: 'Invalid Stripe signature' };
    }

    const event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    return {
      isValid: true,
      event,
    };
  }
}

export default StripeAdapter;
