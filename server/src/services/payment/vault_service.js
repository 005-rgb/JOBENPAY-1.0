// @ts-check
import pool from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';

const ALLOWED_GATEWAYS = new Set(['STRIPE', 'PAYPAL', 'ADYEN']);
const ALLOWED_ENVIRONMENTS = new Set(['SANDBOX', 'PRODUCTION', 'SIMULATED']);

/**
 * Validasi parameter awal vault
 */
function assertOrgAndEnv(orgId, environment) {
  if (!orgId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId is required');
  }
  const env = String(environment || 'SANDBOX').toUpperCase();
  if (!ALLOWED_ENVIRONMENTS.has(env)) {
    throw new AppError('VALIDATION_FAILED', 400, `Invalid environment: ${environment}`);
  }
  return env;
}

/**
 * VaultService: Mengelola tokenized payment methods tanpa menyimpan nomor kartu (PAN) mentah.
 * Memenuhi standar PCI DSS v4.0 (PRD 4.1 §0 Rule 2).
 */
export class VaultService {
  /**
   * Menyimpan payment method tokenized.
   * DILARANG menyimpan PAN / CVV mentah.
   */
  static async savePaymentMethod({
    orgId,
    environment = 'SANDBOX',
    customerId,
    gateway,
    token,
    cardBrand = null,
    cardLast4 = null,
    cardExpMonth = null,
    cardExpYear = null,
    isDefault = false,
    rawCardData = undefined,
  }, dbClient = pool) {
    const env = assertOrgAndEnv(orgId, environment);

    // PCI DSS Check: Tolak jika ada upaya mengirim nomor kartu mentah atau CVV
    if (rawCardData || (typeof token === 'string' && /^\d{13,19}$/.test(token.trim()))) {
      throw new AppError(
        'PCI_DSS_VIOLATION',
        400,
        'PCI_DSS_VIOLATION: Storing raw card numbers (PAN) or sensitive authentication data is strictly prohibited.',
      );
    }

    if (!customerId) {
      throw new AppError('VALIDATION_FAILED', 400, 'customerId is required');
    }

    const gw = String(gateway || '').toUpperCase();
    if (!ALLOWED_GATEWAYS.has(gw)) {
      throw new AppError('INVALID_GATEWAY', 400, `Gateway must be one of: ${Array.from(ALLOWED_GATEWAYS).join(', ')}`);
    }

    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 400, 'token is required');
    }

    // Pastikan cardLast4 valid jika disediakan
    let sanitizedLast4 = null;
    if (cardLast4) {
      const candidate = String(cardLast4).slice(-4);
      if (/^\d{4}$/.test(candidate)) {
        sanitizedLast4 = candidate;
      }
    }

    // Jika isDefault true, nonaktifkan is_default sebelumnya untuk customer yang sama
    if (isDefault) {
      await dbClient.query(
        `UPDATE payment_methods
         SET is_default = FALSE
         WHERE org_id = $1 AND environment = $2 AND customer_id = $3`,
        [orgId, env, customerId],
      );
    }

    const query = `
      INSERT INTO payment_methods (
        org_id, environment, customer_id, gateway, token,
        card_brand, card_last4, card_exp_month, card_exp_year, is_default
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (org_id, environment, token) DO UPDATE SET
        customer_id = EXCLUDED.customer_id,
        gateway = EXCLUDED.gateway,
        card_brand = EXCLUDED.card_brand,
        card_last4 = EXCLUDED.card_last4,
        card_exp_month = EXCLUDED.card_exp_month,
        card_exp_year = EXCLUDED.card_exp_year,
        is_default = EXCLUDED.is_default
      RETURNING *;
    `;

    const res = await dbClient.query(query, [
      orgId,
      env,
      customerId,
      gw,
      token.trim(),
      cardBrand,
      sanitizedLast4,
      cardExpMonth ? Number(cardExpMonth) : null,
      cardExpYear ? Number(cardExpYear) : null,
      Boolean(isDefault),
    ]);

    return res.rows[0];
  }

  /**
   * Mengambil payment method berdasarkan pmId
   */
  static async getPaymentMethod(orgId, environment, pmId, dbClient = pool) {
    const env = assertOrgAndEnv(orgId, environment);
    if (!pmId) {
      throw new AppError('VALIDATION_FAILED', 400, 'pmId is required');
    }

    const res = await dbClient.query(
      `SELECT * FROM payment_methods
       WHERE org_id = $1 AND environment = $2 AND pm_id = $3`,
      [orgId, env, pmId],
    );

    if (res.rowCount === 0) {
      throw new AppError('PAYMENT_METHOD_NOT_FOUND', 404, `Payment method ${pmId} not found`);
    }

    return res.rows[0];
  }

  /**
   * Menampilkan daftar payment methods milik customer
   */
  static async listPaymentMethods(orgId, environment, customerId, dbClient = pool) {
    const env = assertOrgAndEnv(orgId, environment);
    if (!customerId) {
      throw new AppError('VALIDATION_FAILED', 400, 'customerId is required');
    }

    const res = await dbClient.query(
      `SELECT * FROM payment_methods
       WHERE org_id = $1 AND environment = $2 AND customer_id = $3
       ORDER BY is_default DESC, created_at DESC`,
      [orgId, env, customerId],
    );

    return res.rows;
  }

  /**
   * Menghapus payment method
   */
  static async deletePaymentMethod(orgId, environment, pmId, dbClient = pool) {
    const env = assertOrgAndEnv(orgId, environment);
    if (!pmId) {
      throw new AppError('VALIDATION_FAILED', 400, 'pmId is required');
    }

    const res = await dbClient.query(
      `DELETE FROM payment_methods
       WHERE org_id = $1 AND environment = $2 AND pm_id = $3
       RETURNING pm_id`,
      [orgId, env, pmId],
    );

    if (res.rowCount === 0) {
      throw new AppError('PAYMENT_METHOD_NOT_FOUND', 404, `Payment method ${pmId} not found`);
    }

    return { success: true, pm_id: pmId };
  }
}

export default VaultService;
