// @ts-check
import { StripeAdapter } from './connectors/stripe_adapter.js';
import { PayPalAdapter } from './connectors/paypal_adapter.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../lib/errors.js';

const DEFAULT_ADAPTERS = {
  STRIPE: new StripeAdapter(),
  PAYPAL: new PayPalAdapter(),
};

/**
 * In-memory idempotency cache for routePayment (key -> result)
 */
const idempotencyCache = new Map();

/**
 * Bersihkan cache idempotensi (untuk pengujian)
 */
export function clearIdempotencyCache() {
  idempotencyCache.clear();
}

/**
 * PaymentRouter: Smart Failover & Gateway Routing (PRD 4.1 §3.2)
 *
 * Aturan:
 * 1. Urutan prioritas default: ['STRIPE', 'PAYPAL'].
 * 2. Idempotency per-request. Jika request di-retry dengan idempotencyKey sama, kembalikan hasil sebelumnya.
 * 3. Smart Failover: Jika gateway A mengalami soft decline atau timeout, coba gateway B dengan Idempotency-Key baru.
 * 4. Hard Decline = Stop: Jika gateway A mengembalikan hard decline, DILARANG failover. Langsung gagal.
 */
export class PaymentRouter {
  /**
   * @param {object} [options]
   * @param {Record<string, any>} [options.adapters]
   * @param {string[]} [options.priority]
   */
  constructor({ adapters = DEFAULT_ADAPTERS, priority = ['STRIPE', 'PAYPAL'] } = {}) {
    this.adapters = { ...adapters };
    this.priority = [...priority];
  }

  /**
   * Daftarkan atau ganti adaptor gateway
   * @param {string} gateway
   * @param {any} adapter
   */
  registerAdapter(gateway, adapter) {
    this.adapters[gateway.toUpperCase()] = adapter;
  }

  /**
   * Dapatkan adaptor gateway berdasarkan nama
   * @param {string} gateway
   * @returns {any}
   */
  getAdapter(gateway) {
    if (!gateway) return null;
    return this.adapters[gateway.toUpperCase()] || null;
  }

  /**
   * Rutekan pembayaran melalui gateway dengan smart failover
   *
   * @param {string|number|bigint} amount
   * @param {string} currency
   * @param {string} token
   * @param {string} idempotencyKey
   * @param {object} [metadata]
   * @param {object} [options]
   * @param {string[]} [options.priority]
   * @returns {Promise<{ gateway: string, success: boolean, gatewayTxId: string, [key: string]: any }>}
   */
  async routePayment(amount, currency, token, idempotencyKey, metadata = {}, options = {}) {
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw new AppError('VALIDATION_FAILED', 400, 'idempotencyKey is required');
    }

    if (!token || typeof token !== 'string') {
      throw new AppError('VALIDATION_FAILED', 400, 'token is required');
    }

    // 1. Cek idempotensi cache
    if (idempotencyCache.has(idempotencyKey)) {
      return idempotencyCache.get(idempotencyKey);
    }

    const priorityList = options.priority || this.priority;
    const errors = [];

    for (const gateway of priorityList) {
      const adapter = this.adapters[gateway];
      if (!adapter) {
        continue;
      }

      // 2. Setiap gateway menerima idempotency key unik diturunkan
      const gatewayIdempotencyKey = `${idempotencyKey}_${gateway.toLowerCase()}`;

      let result;
      try {
        result = await adapter.authorize(
          amount,
          currency,
          token,
          gatewayIdempotencyKey,
          metadata,
        );
      } catch (err) {
        const networkOrAdapterError = `Gateway ${gateway} error: ${err.message}`;
        logger.error({ gateway, err: err.message }, networkOrAdapterError);
        errors.push({ gateway, message: networkOrAdapterError, error: err });
        continue;
      }

      // Sukses
      if (result && result.success) {
        const response = { gateway, ...result };
        idempotencyCache.set(idempotencyKey, response);
        return response;
      }

      // HARD DECLINE: STOP SEGERA, JANGAN FAILOVER (PRD 4.1 §0 Rule 5)
      if (result && result.isHardDecline) {
        const errMsg = `Hard decline on ${gateway}: ${result.errorMessage || 'Transaction refused'}`;
        logger.warn({ gateway, idempotencyKey, errorCode: result.errorCode }, errMsg);
        throw new AppError('HARD_DECLINE', 400, errMsg, errMsg, {
          gateway,
          errorCode: result.errorCode,
          isHardDecline: true,
        });
      }

      // SOFT DECLINE: Log dan lanjutkan failover ke gateway berikutnya
      const softMsg = `Soft decline on ${gateway}: ${result?.errorMessage || 'Declined'}`;
      logger.warn({ gateway, idempotencyKey, errorCode: result?.errorCode }, softMsg);
      errors.push({ gateway, message: softMsg, softDecline: true });
    }

    // Seluruh gateway gagal
    throw new AppError('ALL_GATEWAYS_FAILED', 502, 'All payment gateways failed', 'Semua gateway pembayaran gagal.', {
      attempts: errors,
    });
  }
}

export const defaultRouter = new PaymentRouter();

export async function routePayment(amount, currency, token, idempotencyKey, metadata, options) {
  return defaultRouter.routePayment(amount, currency, token, idempotencyKey, metadata, options);
}

export default PaymentRouter;
