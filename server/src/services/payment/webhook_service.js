// @ts-check
import pool from '../../db/pool.js';
import { AppError } from '../../errors.js';
import { defaultRouter } from './payment_router.js';
import { logger } from '../../lib/logger.js';

const ALLOWED_GATEWAYS = new Set(['STRIPE', 'PAYPAL', 'ADYEN']);

export class PaymentWebhookService {
  /**
   * @param {object} [options]
   * @param {import('./payment_router.js').PaymentRouter} [options.router]
   */
  constructor({ router = defaultRouter } = {}) {
    this.router = router;
  }

  /**
   * Proses event webhook secara idempoten dan aman tanda tangan
   * @param {object} params
   * @param {string} params.orgId
   * @param {string} params.gateway
   * @param {string|Buffer|object} params.rawBody
   * @param {string|object} params.signature
   * @param {string} [params.environment='SANDBOX']
   * @param {import('pg').PoolClient|import('pg').Pool} [params.dbClient=pool]
   */
  async handleWebhook({
    orgId,
    gateway,
    rawBody,
    signature,
    environment = 'SANDBOX',
    dbClient = pool,
  }) {
    if (!orgId) {
      throw new AppError('VALIDATION_FAILED', 400, 'orgId is required');
    }

    const gw = String(gateway || '').toUpperCase();
    if (!ALLOWED_GATEWAYS.has(gw)) {
      throw new AppError('UNSUPPORTED_GATEWAY', 400, `Unsupported gateway: ${gateway}`);
    }

    const adapter = this.router.getAdapter(gw);
    if (!adapter) {
      throw new AppError('ADAPTER_NOT_FOUND', 500, `Adapter for gateway ${gw} is not registered`);
    }

    // 1. Verifikasi Tanda Tangan Webhook via Adaptor
    const verification = await adapter.verifyWebhook(rawBody, signature);
    if (!verification || !verification.isValid) {
      const errMsg = verification?.errorMessage || `Invalid webhook signature for ${gw}`;
      logger.warn({ gateway: gw, orgId }, errMsg);
      throw new AppError('INVALID_WEBHOOK_SIGNATURE', 401, `INVALID_WEBHOOK_SIGNATURE: ${errMsg}`);
    }

    const event = verification.event || (typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody);

    // 2. Ekstrak gateway_event_id dan event_type
    let gatewayEventId = '';
    let eventType = '';
    let gatewayTxId = '';

    if (gw === 'STRIPE') {
      gatewayEventId = event.id;
      eventType = event.type || 'unknown';
      const obj = event.data?.object || {};
      gatewayTxId = obj.id || obj.payment_intent || '';
    } else if (gw === 'PAYPAL') {
      gatewayEventId = event.id;
      eventType = event.event_type || 'unknown';
      const resource = event.resource || {};
      gatewayTxId = resource.id || resource.parent_payment || '';
    } else {
      gatewayEventId = event.id || event.event_id;
      eventType = event.type || event.event_type || 'unknown';
      gatewayTxId = event.tx_id || event.gateway_tx_id || '';
    }

    if (!gatewayEventId) {
      throw new AppError('INVALID_WEBHOOK_PAYLOAD', 400, 'Missing gateway event identifier in payload');
    }

    // 3. Deduplikasi Idempoten (PRD 4.1 §0 Rule 6)
    // Cek apakah event sudah pernah diproses sebelumnya
    const existingCheck = await dbClient.query(
      `SELECT event_id, processed, event_type
       FROM payment_webhook_events
       WHERE gateway = $1 AND gateway_event_id = $2
       LIMIT 1`,
      [gw, gatewayEventId],
    );

    if (existingCheck.rows.length > 0) {
      const row = existingCheck.rows[0];
      logger.info({ gateway: gw, gatewayEventId, eventType }, 'Idempotent duplicate webhook event ignored');
      return {
        duplicate: true,
        eventId: row.event_id,
        eventType: row.event_type,
        processed: row.processed,
        message: 'Duplicate webhook event already handled',
      };
    }

    // 4. Catat event ke tabel payment_webhook_events
    const insertRes = await dbClient.query(
      `INSERT INTO payment_webhook_events (
         org_id, gateway, gateway_event_id, event_type, payload, processed
       ) VALUES ($1, $2, $3, $4, $5, FALSE)
       RETURNING event_id`,
      [orgId, gw, gatewayEventId, eventType, JSON.stringify(event)],
    );
    const eventId = insertRes.rows[0].event_id;

    // 5. Update Status Transaksi Berdasarkan State Machine
    let targetStatus = null;

    if (
      eventType === 'payment_intent.succeeded' ||
      eventType === 'charge.captured' ||
      eventType === 'PAYMENT.CAPTURE.COMPLETED'
    ) {
      targetStatus = 'CAPTURED';
    } else if (
      eventType === 'charge.refunded' ||
      eventType === 'PAYMENT.CAPTURE.REFUNDED'
    ) {
      targetStatus = 'REFUNDED';
    } else if (
      eventType === 'charge.partially_refunded' ||
      eventType === 'PAYMENT.CAPTURE.PARTIALLY_REFUNDED'
    ) {
      targetStatus = 'PARTIALLY_REFUNDED';
    } else if (
      eventType === 'payment_intent.payment_failed' ||
      eventType === 'PAYMENT.CAPTURE.DENIED'
    ) {
      targetStatus = 'FAILED';
    }

    let updatedTx = null;
    if (targetStatus && gatewayTxId) {
      const txRes = await dbClient.query(
        `SELECT tx_id, status FROM payment_transactions
         WHERE org_id = $1 AND environment = $2 AND gateway_tx_id = $3
         LIMIT 1`,
        [orgId, environment, gatewayTxId],
      );

      if (txRes.rows.length > 0) {
        const tx = txRes.rows[0];
        if (tx.status !== targetStatus) {
          const updateRes = await dbClient.query(
            `UPDATE payment_transactions
             SET status = $1, updated_at = now()
             WHERE tx_id = $2
             RETURNING tx_id, status, gateway_tx_id`,
            [targetStatus, tx.tx_id],
          );
          updatedTx = updateRes.rows[0];
          logger.info({ txId: tx.tx_id, oldStatus: tx.status, newStatus: targetStatus }, 'Webhook updated payment transaction status');
        }
      }
    }

    // 6. Tandai event berhasil diproses
    await dbClient.query(
      `UPDATE payment_webhook_events SET processed = TRUE WHERE event_id = $1`,
      [eventId],
    );

    return {
      success: true,
      duplicate: false,
      eventId,
      eventType,
      updatedTransaction: updatedTx,
    };
  }
}

export const defaultWebhookService = new PaymentWebhookService();

export async function handleWebhook(params) {
  return defaultWebhookService.handleWebhook(params);
}
