// @ts-check

/**
 * BaseConnector: Kontrak seragam untuk semua payment gateway connector (PRD 4.1 §3.1)
 */
export class BaseConnector {
  /**
   * @param {string|number|bigint} amount
   * @param {string} currency
   * @param {string} token
   * @param {string} idempotencyKey
   * @param {object} [metadata]
   * @returns {Promise<{ success: boolean, gatewayTxId?: string, isHardDecline?: boolean, errorMessage?: string, [key: string]: any }>}
   */
  async authorize(amount, currency, token, idempotencyKey, metadata) {
    throw new Error('Not implemented: authorize');
  }

  /**
   * @param {string} gatewayTxId
   * @param {string|number|bigint} amount
   * @param {string} idempotencyKey
   * @returns {Promise<{ success: boolean, gatewayTxId?: string, isHardDecline?: boolean, errorMessage?: string, [key: string]: any }>}
   */
  async capture(gatewayTxId, amount, idempotencyKey) {
    throw new Error('Not implemented: capture');
  }

  /**
   * @param {string} gatewayTxId
   * @param {string|number|bigint} amount
   * @param {string} idempotencyKey
   * @returns {Promise<{ success: boolean, refundId?: string, isHardDecline?: boolean, errorMessage?: string, [key: string]: any }>}
   */
  async refund(gatewayTxId, amount, idempotencyKey) {
    throw new Error('Not implemented: refund');
  }

  /**
   * @param {string|Buffer} rawBody
   * @param {string|object} signature
   * @returns {Promise<{ isValid: boolean, event?: object, errorMessage?: string }>}
   */
  async verifyWebhook(rawBody, signature) {
    throw new Error('Not implemented: verifyWebhook');
  }
}

export default BaseConnector;
