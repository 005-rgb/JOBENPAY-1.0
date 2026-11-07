// @ts-check
import { Router } from 'express';
import {
  createIntentAnchorHandler,
  getIntentAnchorHandler,
  getDipHandler,
  handleAgentTransaction,
} from '../controllers/dip_controller.js';

/**
 * Creates the router for DIP routes.
 */
export function createDipRouter({ requireSession, requireCsrf, agentAuth } = {}) {
  const router = Router();
  const sessionAuth = requireSession || ((req, res, next) => next());
  const csrf = requireCsrf || ((req, res, next) => next());
  const agent = agentAuth || ((req, res, next) => next());

  // 1. DIP Inspection Route
  router.get('/requests/:id/dip', sessionAuth, getDipHandler);

  // 2. Agent Transactions Route with DIP enforcement (PRD 1.6 §9.2)
  router.post('/agent/v1/transactions', agent, handleAgentTransaction);

  return router;
}

export default createDipRouter;
