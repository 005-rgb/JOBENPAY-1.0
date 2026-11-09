// @ts-check
import { Router } from 'express';
import {
  getGatewaysHandler,
  getPaymentStatsHandler,
  listVaultMethodsHandler,
  addVaultMethodHandler,
  deleteVaultMethodHandler,
  setDefaultVaultMethodHandler,
  listTransactionsHandler,
  getTransactionHandler,
  executePaymentHandler,
  capturePaymentHandler,
  refundPaymentHandler,
  listWebhooksHandler,
  postWebhookHandler,
} from '../controllers/payment_controller.js';

/**
 * Creates the Payment Orchestration Layer (POL) express router.
 *
 * @param {object} [options]
 * @param {import('express').RequestHandler} [options.requireSession]
 * @param {Function} [options.requireRole]
 * @param {import('express').RequestHandler} [options.requireCsrf]
 * @returns {Router}
 */
export function createPaymentsRouter({ requireSession, requireCsrf } = {}) {
  const router = Router();
  const sessionAuth = requireSession || ((req, res, next) => next());
  const csrfAuth = requireCsrf || ((req, res, next) => next());

  // Gateways status & routing config
  router.get('/payments/gateways', (req, res, next) => getGatewaysHandler(req, res, next));

  // Analytics & Stats
  router.get('/payments/stats', sessionAuth, (req, res, next) => getPaymentStatsHandler(req, res, next));

  // Self-Owned Network Token Vault (PCI DSS v4.0)
  router.get('/payments/vault', sessionAuth, (req, res, next) => listVaultMethodsHandler(req, res, next));
  router.post('/payments/vault', sessionAuth, csrfAuth, (req, res, next) => addVaultMethodHandler(req, res, next));
  router.delete('/payments/vault/:pmId', sessionAuth, csrfAuth, (req, res, next) => deleteVaultMethodHandler(req, res, next));
  router.post('/payments/vault/:pmId/default', sessionAuth, csrfAuth, (req, res, next) => setDefaultVaultMethodHandler(req, res, next));

  // Orchestrated Payment Transactions
  router.get('/payments/transactions', sessionAuth, (req, res, next) => listTransactionsHandler(req, res, next));
  router.get('/payments/transactions/:txId', sessionAuth, (req, res, next) => getTransactionHandler(req, res, next));
  router.post('/payments/execute', sessionAuth, csrfAuth, (req, res, next) => executePaymentHandler(req, res, next));
  router.post('/payments/:txId/capture', sessionAuth, csrfAuth, (req, res, next) => capturePaymentHandler(req, res, next));
  router.post('/payments/:txId/refund', sessionAuth, csrfAuth, (req, res, next) => refundPaymentHandler(req, res, next));

  // Inbound Webhooks & Dedup Log
  router.get('/payments/webhooks', sessionAuth, (req, res, next) => listWebhooksHandler(req, res, next));
  router.post('/payments/webhooks/:gateway', (req, res, next) => postWebhookHandler(req, res, next));

  return router;
}

export default createPaymentsRouter;
