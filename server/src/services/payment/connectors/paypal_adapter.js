// @ts-check
import { BaseConnector } from './base_connector.js';
import crypto from 'node:crypto';

const HARD_DECLINE_CODES = new Set([
  'ACCOUNT_CLOSED',
  'SUSPECTED_FRAUD',
  'UNAUTHORIZED_PAYMENT',
  'PAYER_ACTION_REQUIRED_CANNOT_CONTINUE',
  'BUYER_COMPLAINT_RESTRICTION',
]);

/**
 * PayPalAdapter: Implementasi BaseConnector untuk PayPal (PRD 4.1 §3.1)
 */
export class PayPalAdapter extends BaseConnector {
  /**
   * @param {object} [options]
   * @param {Function} [options.client] - Mock / injected client
   */
  constructor({ client = null } = {}) {
    super();
    this.client = client;
  }

  /**
   * Authorize payment via PayPal
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
          gateway: 'PAYPAL',
          isHardDecline: true,
          errorCode: 'SUSPECTED_FRAUD',
          errorMessage: 'PayPal hard decline: Account flagged for suspected fraud.',
        };
      }

      if (
        token === 'tok_soft_decline' ||
        token?.includes('paypal_soft_decline') ||
        (metadata?.simulateSoftDecline && !token?.includes('tok_visa_soft_decline'))
      ) {
        return {
          success: false,
          gateway: 'PAYPAL',
          isHardDecline: false,
          errorCode: 'INSUFFICIENT_FUNDS',
          errorMessage: 'PayPal soft decline: Insufficient balance.',
        };
      }

      const txId = `auth_paypal_${crypto.randomBytes(12).toString('hex')}`;
      return {
        success: true,
        gateway: 'PAYPAL',
        gatewayTxId: txId,
        idempotencyKey,
        amount,
        currency,
        status: 'AUTHORIZED',
      };
    } catch (err) {
      const isHard = HARD_DECLINE_CODES.has(err.code || err.issue);
      return {
        success: false,
        gateway: 'PAYPAL',
        isHardDecline: isHard,
        errorCode: err.code || 'PAYPAL_ERROR',
        errorMessage: err.message || 'PayPal authorization failed',
      };
    }
  }

  /**
   * Capture authorized PayPal order/payment
   */
  async capture(gatewayTxId, amount, idempotencyKey) {
    if (this.client && typeof this.client.capture === 'function') {
      return await this.client.capture({ gatewayTxId, amount, idempotencyKey });
    }

    return {
      success: true,
      gateway: 'PAYPAL',
      gatewayTxId,
      status: 'CAPTURED',
      amount,
      idempotencyKey,
    };
  }

  /**
   * Refund payment
   */
  async refund(gatewayTxId, amount, idempotencyKey) {
    if (this.client && typeof this.client.refund === 'function') {
      return await this.client.refund({ gatewayTxId, amount, idempotencyKey });
    }

    const refundId = `re_paypal_${crypto.randomBytes(12).toString('hex')}`;
    return {
      success: true,
      gateway: 'PAYPAL',
      gatewayTxId,
      refundId,
      status: 'REFUNDED',
      amount,
      idempotencyKey,
    };
  }

  /**
   * Verify PayPal webhook signature
   */
  async verifyWebhook(rawBody, signature) {
    if (this.client && typeof this.client.verifyWebhook === 'function') {
      return await this.client.verifyWebhook({ rawBody, signature });
    }

    if (!signature || signature === 'invalid_signature') {
      return { isValid: false, errorMessage: 'Invalid PayPal webhook signature' };
    }

    const event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    return {
      isValid: true,
      event,
    };
  }
}

export default PayPalAdapter;
