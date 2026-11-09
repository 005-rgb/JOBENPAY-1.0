// @ts-check
import pool from '../../db/pool.js';
import { AppError } from '../../errors.js';
import { defaultRouter } from './payment_router.js';
import { VaultService } from './vault_service.js';
import { logger } from '../../lib/logger.js';
import { getCircuitBreaker } from '../../lib/circuit-breaker.js';

export class PaymentOrchestrator {
  /**
   * @param {object} [options]
   * @param {import('./payment_router.js').PaymentRouter} [options.router]
   * @param {import('../../lib/circuit-breaker.js').CircuitBreaker} [options.breaker]
   */
  constructor({
    router = defaultRouter,
    breaker = getCircuitBreaker('paypal-orchestrator', { failureThreshold: 3, timeout: 10000 }),
  } = {}) {
    this.router = router;
    this.breaker = breaker;
  }

  /**
   * Mengorkestrasi otorisasi pembayaran dari Vault, Router, hingga Transaksi State Machine
   * @param {object} params
   * @param {string} params.orgId
   * @param {string} [params.environment='SANDBOX']
   * @param {string} params.requestId
   * @param {string} [params.customerId]
   * @param {string|number|bigint} params.amountMinor
   * @param {string} params.currency
   * @param {string} [params.paymentMethodId]
   * @param {string} [params.token]
   * @param {string} params.idempotencyKey
   * @param {object} [params.metadata={}]
   * @param {string[]} [params.priority]
   * @param {import('pg').PoolClient|import('pg').Pool} [params.dbClient=pool]
   */
  async createPayment({
    orgId,
    environment = 'SANDBOX',
    requestId,
    customerId,
    amountMinor,
    currency,
    paymentMethodId,
    token,
    idempotencyKey,
    metadata = {},
    priority,
    dbClient = pool,
  }) {
    if (!orgId) throw new AppError('VALIDATION_FAILED', 400, 'orgId is required');
    if (!requestId) throw new AppError('VALIDATION_FAILED', 400, 'requestId is required');
    if (!idempotencyKey) throw new AppError('VALIDATION_FAILED', 400, 'idempotencyKey is required');
    if (!currency || currency.length !== 3) {
      throw new AppError('VALIDATION_FAILED', 400, 'currency must be a 3-letter ISO code');
    }

    const cur = currency.toUpperCase();
    const env = ['LIVE', 'PRODUCTION'].includes(String(environment).toUpperCase()) ? 'PRODUCTION' : 'SANDBOX';
    const amountVal = BigInt(amountMinor);
    if (amountVal <= 0n) {
      throw new AppError('VALIDATION_FAILED', 400, 'amountMinor must be positive');
    }

    // 1. Idempotency Check pada Tabel Transaksi
    const existingTx = await dbClient.query(
      `SELECT tx_id, org_id, environment, request_id, gateway, gateway_tx_id, amount_minor, currency, status, idempotency_key, created_at, updated_at
       FROM payment_transactions
       WHERE idempotency_key = $1
       LIMIT 1`,
      [idempotencyKey],
    );

    if (existingTx.rows.length > 0) {
      logger.info({ idempotencyKey, txId: existingTx.rows[0].tx_id }, 'Idempotent payment transaction returned from DB');
      return {
        idempotent: true,
        transaction: existingTx.rows[0],
      };
    }

    // 2. Selesaikan Token Pembayaran (dari Vault jika paymentMethodId ada)
    let paymentToken = token;
    if (paymentMethodId) {
      const pm = await VaultService.getPaymentMethod(orgId, env, paymentMethodId, dbClient);
      paymentToken = pm.token;
    }

    if (!paymentToken) {
      throw new AppError('VALIDATION_FAILED', 400, 'Payment token or paymentMethodId is required');
    }

    // 3. Simpan state INITIATED ke DB
    const initRes = await dbClient.query(
      `INSERT INTO payment_transactions (
         org_id, environment, request_id, gateway, amount_minor, currency, status, idempotency_key
       ) VALUES ($1, $2, $3, $4, $5, $6, 'INITIATED', $7)
       RETURNING tx_id`,
      [orgId, env, requestId, 'PENDING', amountVal.toString(), cur, idempotencyKey],
    );
    const txId = initRes.rows[0].tx_id;

    // 4. Kirim ke PaymentRouter untuk otorisasi & smart failover (dibungkus Circuit Breaker PRD 1.9)
    try {
      const routeResult = await this.breaker.execute(async () => {
        try {
          return await this.router.routePayment(
            amountVal,
            cur,
            paymentToken,
            idempotencyKey,
            metadata,
            { priority },
          );
        } catch (err) {
          if (
            (err.httpStatus && err.httpStatus < 500) ||
            (err.statusCode && err.statusCode < 500) ||
            err.code === 'HARD_DECLINE' ||
            err.code === 'VALIDATION_FAILED'
          ) {
            err.isCircuitBreakerIgnored = true;
          }
          throw err;
        }
      });

      // 5. Update Transaksi ke AUTHORIZED
      const authRes = await dbClient.query(
        `UPDATE payment_transactions
         SET gateway = $1, gateway_tx_id = $2, status = 'AUTHORIZED', updated_at = now()
         WHERE tx_id = $3
         RETURNING tx_id, org_id, environment, request_id, gateway, gateway_tx_id, amount_minor, currency, status, idempotency_key, created_at, updated_at`,
        [routeResult.gateway, routeResult.gatewayTxId, txId],
      );

      return {
        idempotent: false,
        success: true,
        transaction: authRes.rows[0],
        routeResult,
      };
    } catch (err) {
      if (err.message && err.message.includes('is OPEN')) {
        err.code = 'CIRCUIT_OPEN';
        err.httpStatus = 503;
      }
      // 6. Jika gagal / hard decline / all gateways failed -> update ke FAILED
      const failedRes = await dbClient.query(
        `UPDATE payment_transactions
         SET status = 'FAILED', error_code = $1, error_message = $2, updated_at = now()
         WHERE tx_id = $3
         RETURNING tx_id, org_id, environment, request_id, gateway, amount_minor, currency, status, error_code, error_message`,
        [err.code || 'PAYMENT_FAILED', err.message, txId],
      );

      logger.error({ txId, err: err.message, code: err.code }, 'Payment authorization failed');
      throw new AppError(err.code || 'PAYMENT_FAILED', err.httpStatus || 400, err.message, err.message, {
        txId,
        transaction: failedRes.rows[0],
      });
    }
  }

  /**
   * Capture pembayaran terotorisasi
   * @param {object} params
   * @param {string} params.orgId
   * @param {string} [params.environment='SANDBOX']
   * @param {string} params.txId
   * @param {string|number|bigint} [params.amountMinor]
   * @param {string} params.idempotencyKey
   * @param {import('pg').PoolClient|import('pg').Pool} [params.dbClient=pool]
   */
  async capturePayment({
    orgId,
    environment = 'SANDBOX',
    txId,
    amountMinor,
    idempotencyKey,
    dbClient = pool,
  }) {
    if (!orgId) throw new AppError('VALIDATION_FAILED', 400, 'orgId is required');
    if (!txId) throw new AppError('VALIDATION_FAILED', 400, 'txId is required');
    if (!idempotencyKey) throw new AppError('VALIDATION_FAILED', 400, 'idempotencyKey is required');

    const env = ['LIVE', 'PRODUCTION'].includes(String(environment).toUpperCase()) ? 'PRODUCTION' : 'SANDBOX';

    // 1. Ambil transaksi yang berstatus AUTHORIZED
    const txRes = await dbClient.query(
      `SELECT tx_id, org_id, environment, request_id, gateway, gateway_tx_id, amount_minor, currency, status
       FROM payment_transactions
       WHERE tx_id = $1 AND org_id = $2 AND environment = $3
       FOR UPDATE`,
      [txId, orgId, env],
    );

    if (txRes.rows.length === 0) {
      throw new AppError('PAYMENT_NOT_FOUND', 404, `PAYMENT_NOT_FOUND: Payment transaction ${txId} not found`);
    }

    const tx = txRes.rows[0];
    if (tx.status !== 'AUTHORIZED') {
      throw new AppError('INVALID_STATE', 409, `INVALID_STATE: Cannot capture payment with status ${tx.status}`);
    }

    const adapter = this.router.getAdapter(tx.gateway);
    if (!adapter) {
      throw new AppError('ADAPTER_NOT_FOUND', 500, `ADAPTER_NOT_FOUND: No adapter found for gateway ${tx.gateway}`);
    }

    const captureAmount = amountMinor ? BigInt(amountMinor) : BigInt(tx.amount_minor);

    // 2. Panggil Gateway Capture (dibungkus Circuit Breaker PRD 1.9)
    let capRes;
    try {
      capRes = await this.breaker.execute(async () => {
        return adapter.capture(tx.gateway_tx_id, captureAmount, idempotencyKey);
      });
    } catch (err) {
      if (err.message && err.message.includes('is OPEN')) {
        throw new AppError('CIRCUIT_OPEN', 503, `CIRCUIT_OPEN: ${err.message}`);
      }
      throw err;
    }
    if (!capRes || !capRes.success) {
      throw new AppError('CAPTURE_FAILED', 400, `CAPTURE_FAILED: ${capRes?.errorMessage || 'Capture failed at gateway'}`);
    }

    // 3. Update status ke CAPTURED
    const updateRes = await dbClient.query(
      `UPDATE payment_transactions
       SET status = 'CAPTURED', updated_at = now()
       WHERE tx_id = $1
       RETURNING tx_id, org_id, environment, request_id, gateway, gateway_tx_id, amount_minor, currency, status, updated_at`,
      [txId],
    );

    return {
      success: true,
      transaction: updateRes.rows[0],
      captureResult: capRes,
    };
  }

  /**
   * Refund pembayaran yang telah tercapture
   * @param {object} params
   * @param {string} params.orgId
   * @param {string} [params.environment='SANDBOX']
   * @param {string} params.txId
   * @param {string|number|bigint} [params.amountMinor]
   * @param {string} params.idempotencyKey
   * @param {boolean} [params.isPartial=false]
   * @param {import('pg').PoolClient|import('pg').Pool} [params.dbClient=pool]
   */
  async refundPayment({
    orgId,
    environment = 'SANDBOX',
    txId,
    amountMinor,
    idempotencyKey,
    isPartial = false,
    dbClient = pool,
  }) {
    if (!orgId) throw new AppError('VALIDATION_FAILED', 400, 'orgId is required');
    if (!txId) throw new AppError('VALIDATION_FAILED', 400, 'txId is required');
    if (!idempotencyKey) throw new AppError('VALIDATION_FAILED', 400, 'idempotencyKey is required');

    const env = ['LIVE', 'PRODUCTION'].includes(String(environment).toUpperCase()) ? 'PRODUCTION' : 'SANDBOX';

    // 1. Ambil transaksi yang berstatus CAPTURED atau PARTIALLY_REFUNDED
    const txRes = await dbClient.query(
      `SELECT tx_id, org_id, environment, request_id, gateway, gateway_tx_id, amount_minor, currency, status
       FROM payment_transactions
       WHERE tx_id = $1 AND org_id = $2 AND environment = $3
       FOR UPDATE`,
      [txId, orgId, env],
    );

    if (txRes.rows.length === 0) {
      throw new AppError('PAYMENT_NOT_FOUND', 404, `PAYMENT_NOT_FOUND: Payment transaction ${txId} not found`);
    }

    const tx = txRes.rows[0];
    if (tx.status !== 'CAPTURED' && tx.status !== 'PARTIALLY_REFUNDED') {
      throw new AppError('INVALID_STATE', 409, `INVALID_STATE: Cannot refund payment with status ${tx.status}`);
    }

    const adapter = this.router.getAdapter(tx.gateway);
    if (!adapter) {
      throw new AppError('ADAPTER_NOT_FOUND', 500, `ADAPTER_NOT_FOUND: No adapter found for gateway ${tx.gateway}`);
    }

    const refundAmount = amountMinor ? BigInt(amountMinor) : BigInt(tx.amount_minor);

    // 2. Panggil Gateway Refund (dibungkus Circuit Breaker PRD 1.9)
    let refRes;
    try {
      refRes = await this.breaker.execute(async () => {
        return adapter.refund(tx.gateway_tx_id, refundAmount, idempotencyKey);
      });
    } catch (err) {
      if (err.message && err.message.includes('is OPEN')) {
        throw new AppError('CIRCUIT_OPEN', 503, `CIRCUIT_OPEN: ${err.message}`);
      }
      throw err;
    }
    if (!refRes || !refRes.success) {
      throw new AppError('REFUND_FAILED', 400, `REFUND_FAILED: ${refRes?.errorMessage || 'Refund failed at gateway'}`);
    }

    const nextStatus = isPartial ? 'PARTIALLY_REFUNDED' : 'REFUNDED';

    // 3. Update status ke REFUNDED / PARTIALLY_REFUNDED
    const updateRes = await dbClient.query(
      `UPDATE payment_transactions
       SET status = $1, updated_at = now()
       WHERE tx_id = $2
       RETURNING tx_id, org_id, environment, request_id, gateway, gateway_tx_id, amount_minor, currency, status, updated_at`,
      [nextStatus, txId],
    );

    return {
      success: true,
      transaction: updateRes.rows[0],
      refundResult: refRes,
    };
  }
}

export const defaultOrchestrator = new PaymentOrchestrator();
