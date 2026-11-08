// @ts-check
import { Router } from 'express';
import { getSLOs, getSLOByIdHandler } from '../controllers/slo_controller.js';

export function createOpsRouter({ requireSession } = {}) {
  const router = Router();
  const sessionAuth = requireSession || ((req, res, next) => next());

  // WP1: SLO endpoints
  router.get('/ops/slo', sessionAuth, getSLOs);
  router.get('/ops/slo/:id', sessionAuth, getSLOByIdHandler);

  return router;
}

export default createOpsRouter;
