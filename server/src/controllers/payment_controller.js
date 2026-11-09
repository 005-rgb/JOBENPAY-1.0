// @ts-check
import pool from '../db/pool.js';
import { AppError } from '../errors.js';
import { PaymentOrchestrator } from '../services/payment/orchestrator.js';
import {
  savePaymentMethod,
  getPaymentMethod,
  listPaymentMethods,
  deletePaymentMethod,
  setDefaultPaymentMethod,
} from '../services/payment/vault_service.js';
import { PaymentWebhookService } from '../services/payment/webhook_service.js';
import {
  listPaymentTransactions,
  getPaymentTransactionById,
  listPaymentWebhookEvents,
  getPaymentStats,
} from '../repositories/payments.js';

const orchestrator = new PaymentOrchestrator();
const webhookService = new PaymentWebhookService();

/**
 * Deep serializer to convert BigInt values to string representation for JSON output.
 * @param {any} data
 * @returns {any}
 */
export function serializePayload(data) {
  if (data === null || data === undefined) return data;
  if (typeof data === 'bigint') return data.toString();
  if (Array.isArray(data)) return data.map(serializePayload);
  if (typeof data === 'object') {
    if (data instanceof Date) return data.toISOString();
    const result = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = serializePayload(value);
    }
    return result;
  }
  return data;
}

/**
 * Resolve tenant organization ID from request context.
 *
 * @param {import('express').Request} req
 * @returns {string | null}
 */
export function resolveOrgId(req) {
  return (
    req.session?.current_org_id ||
    req.org?.id ||
    req.session?.org_id ||
    req.user?.org_id ||
    (typeof req.headers?.['x-org-id'] === 'string' ? req.headers['x-org-id'] : null) ||
    (typeof req.query?.org_id === 'string' ? req.query.org_id : null) ||
    (typeof req.body?.org_id === 'string' ? req.body.org_id : null) ||
    null
  );
}

/**
 * Resolve environment (SANDBOX / PRODUCTION / SIMULATED).
 *
 * @param {import('express').Request} req
 * @returns {'SANDBOX' | 'PRODUCTION' | 'SIMULATED'}
 */
export function resolveEnvironment(req) {
  const env =
    req.currentEnvironment ||
    req.environment ||
    req.headers?.['x-environment'] ||
    req.body?.environment ||
    'SANDBOX';
  if (env === 'PRODUCTION' || env === 'LIVE') return 'PRODUCTION';
  if (env === 'SIMULATED') return 'SIMULATED';
  return 'SANDBOX';
}

/**
 * GET /api/v1/payments/gateways
 * Returns supported payment gateways and routing configuration.
 */
export async function getGatewaysHandler(req, res, next) {
  try {
    const environment = resolveEnvironment(req);
    res.status(200).json(serializePayload({
      gateways: [
        {
          id: 'STRIPE',
          name: 'Stripe Network Tokenizer',
          status: 'ACTIVE',
          role: 'PRIMARY',
          supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD'],
          supportsTokenization: true,
          mode: environment,
        },
        {
          id: 'PAYPAL',
          name: 'PayPal Sandbox & Smart Gateway',
          status: 'ACTIVE',
          role: 'FAILOVER',
          supportedCurrencies: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'],
          supportsTokenization: true,
          mode: environment,
        },
        {
          id: 'ADYEN',
          name: 'Adyen Global Financial Connector',
          status: 'STANDBY',
          role: 'SECONDARY_FAILOVER',
          supportedCurrencies: ['USD', 'EUR', 'GBP', 'CHF', 'SEK', 'NOK'],
          supportsTokenization: true,
          mode: environment,
        },
      ],
      routingStrategy: {
        priority: ['STRIPE', 'PAYPAL'],
        smartFailover: true,
        haltOnHardDecline: true,
        zeroPanStorage: true,
      },
      environment,
    }));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/payments/stats
 * Returns payment processing statistics for organization.
 */
export async function getPaymentStatsHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
    const environment = resolveEnvironment(req);
    const stats = await getPaymentStats(orgId, environment);
    res.status(200).json(serializePayload(stats));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/payments/vault
 * List tokenized payment methods for organization & environment.
 */
export async function listVaultMethodsHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
    const environment = resolveEnvironment(req);
    const customerId = typeof req.query.customer_id === 'string' ? req.query.customer_id : null;
    const methods = await listPaymentMethods(orgId, environment, customerId);
    res.status(200).json(serializePayload({ paymentMethods: methods }));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/payments/vault
 * Save tokenized card / network token (Strict PCI DSS v4.0).
 */
export async function addVaultMethodHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
    const environment = resolveEnvironment(req);

    const { customerId, gateway, token, cardMeta } = req.body;
    if (!customerId || !gateway || !token) {
      throw new AppError('VALIDATION_FAILED', 400, 'customerId, gateway, and token are required');
    }

    const saved = await savePaymentMethod(
      orgId,
      environment,
      customerId,
      gateway.toUpperCase(),
      token,
      cardMeta || {},
    );

    res.status(201).json(serializePayload({ paymentMethod: saved }));
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/payments/vault/:pmId
 * Delete a payment method from the vault.
 */
export async function deleteVaultMethodHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
    const environment = resolveEnvironment(req);
    const { pmId } = req.params;

    const deleted = await deletePaymentMethod(orgId, environment, pmId);
    if (!deleted) throw new AppError('NOT_FOUND', 404, 'Payment method not found');

    res.status(200).json(serializePayload({ success: true, deletedPmId: pmId }));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/payments/vault/:pmId/default
 * Set a payment method as default for the customer.
 */
export async function setDefaultVaultMethodHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
    const environment = resolveEnvironment(req);
    const { pmId } = req.params;

    const updated = await setDefaultPaymentMethod(orgId, environment, pmId);
    res.status(200).json(serializePayload({ paymentMethod: updated }));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/payments/transactions
 * List payment transactions with filters and pagination.
 */
export async function listTransactionsHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
    const environment = resolveEnvironment(req);

    const result = await listPaymentTransactions(orgId, environment, req.query);
    res.status(200).json(serializePayload(result));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/payments/transactions/:txId
 * Get a single transaction by ID.
 */
export async function getTransactionHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
    const environment = resolveEnvironment(req);
    const { txId } = req.params;

    const tx = await getPaymentTransactionById(orgId, environment, txId);
    if (!tx) throw new AppError('NOT_FOUND', 404, 'Payment transaction not found');

    res.status(200).json(serializePayload({ transaction: tx }));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/payments/execute
 * Create and route a payment transaction through POL Orchestrator.
 */
export async function executePaymentHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
    const environment = resolveEnvironment(req);

    const idempotencyKey =
      req.get('idempotency-key') ||
      req.body?.idempotencyKey ||
      req.body?.idempotency_key;

    if (!idempotencyKey) {
      throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 400, 'Idempotency-Key header or property is required');
    }

    const {
      requestId,
      customerId,
      paymentMethodId,
      token,
      amountMinor,
      currency,
      metadata,
      simulateResult,
    } = req.body;

    if (!amountMinor || !currency) {
      throw new AppError('VALIDATION_FAILED', 400, 'amountMinor and currency are required');
    }

    const result = await orchestrator.createPayment({
      orgId,
      environment,
      requestId,
      customerId,
      paymentMethodId,
      token,
      amountMinor,
      currency,
      idempotencyKey,
      metadata,
    });

    res.status(201).json(serializePayload(result));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/payments/:txId/capture
 * Capture an authorized transaction.
 */
export async function capturePaymentHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
    const environment = resolveEnvironment(req);
    const { txId } = req.params;
    const idempotencyKey =
      req.get('idempotency-key') ||
      req.body?.idempotencyKey ||
      `cap_${txId}_${Date.now()}`;

    const amountMinor = req.body?.amountMinor ? BigInt(req.body.amountMinor) : null;
    const result = await orchestrator.capturePayment({
      orgId,
      environment,
      txId,
      amountMinor,
      idempotencyKey,
    });
    res.status(200).json(serializePayload(result));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/payments/:txId/refund
 * Refund a captured transaction (Full or Partial).
 */
export async function refundPaymentHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
    const environment = resolveEnvironment(req);
    const { txId } = req.params;
    const idempotencyKey =
      req.get('idempotency-key') ||
      req.body?.idempotencyKey ||
      `ref_${txId}_${Date.now()}`;

    const amountMinor = req.body?.amountMinor ? BigInt(req.body.amountMinor) : null;
    const result = await orchestrator.refundPayment({
      orgId,
      environment,
      txId,
      amountMinor,
      idempotencyKey,
    });
    res.status(200).json(serializePayload(result));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/payments/webhooks
 * List processed webhook events for audit.
 */
export async function listWebhooksHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) throw new AppError('UNAUTHORIZED', 401, 'Organization context required');

    const events = await listPaymentWebhookEvents(orgId, req.query);
    res.status(200).json(serializePayload({ events }));
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/payments/webhooks/:gateway
 * Ingest inbound webhook from Stripe / PayPal / Adyen.
 */
export async function postWebhookHandler(req, res, next) {
  try {
    const gateway = (req.params.gateway || '').toUpperCase();
    let orgId = resolveOrgId(req);
    if (!orgId) {
      // For external webhooks without session or header, fallback to default org from db
      const orgQuery = await pool.query('SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1');
      if (orgQuery.rows.length > 0) {
        orgId = orgQuery.rows[0].id;
      }
    }
    if (!orgId) {
      throw new AppError('VALIDATION_FAILED', 400, 'orgId could not be resolved for webhook event');
    }

    const environment = resolveEnvironment(req);
    const rawBody = typeof req.body === 'string' || Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : JSON.stringify(req.body);

    const signature =
      req.get('stripe-signature') ||
      req.get('paypal-transmission-sig') ||
      req.get('x-signature') ||
      req.body?.signature ||
      '';

    const result = await webhookService.handleWebhook({
      orgId,
      gateway,
      rawBody,
      signature,
      environment,
    });
    res.status(200).json(serializePayload(result));
  } catch (err) {
    next(err);
  }
}
