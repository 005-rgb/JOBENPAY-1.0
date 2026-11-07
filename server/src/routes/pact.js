/**
 * server/src/routes/pact.js
 * PRD 1.4 Trust Infrastructure (Fase C: PACT Arbitration & Bonding, WP5)
 *
 * RESTful API router for Polymorphic Agent Contract Tokens (PACT).
 */

import { Router } from 'express';
import {
  getContractHandler,
  postContract,
  postDeliver,
  postDispute,
  postFund,
  postSettle,
  postVerify,
} from '../controllers/pact_controller.js';

export function createPactRouter({ requireSession, requireRole, requireCsrf } = {}) {
  const router = Router();

  const authMiddleware = requireSession || function requireSession(req, res, next) { next(); };
  const csrfMiddleware = requireCsrf || function requireCsrf(req, res, next) { next(); };

  router.post('/pact/contracts', authMiddleware, csrfMiddleware, postContract);
  router.get('/pact/contracts/:id', authMiddleware, getContractHandler);
  router.post('/pact/contracts/:id/fund', authMiddleware, csrfMiddleware, postFund);
  router.post('/pact/contracts/:id/deliver', authMiddleware, csrfMiddleware, postDeliver);
  router.post('/pact/contracts/:id/verify', authMiddleware, csrfMiddleware, postVerify);
  router.post('/pact/contracts/:id/settle', authMiddleware, csrfMiddleware, postSettle);
  router.post('/pact/contracts/:id/dispute', authMiddleware, csrfMiddleware, postDispute);

  return router;
}

export const pactRouter = createPactRouter();
export default pactRouter;
