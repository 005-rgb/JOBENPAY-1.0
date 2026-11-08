// @ts-check
import { Router } from 'express';
import { getSLOs, getSLOByIdHandler } from '../controllers/slo_controller.js';
import { getCircuitBreakers } from '../controllers/circuit_breaker_controller.js';

export function createOpsRouter({ requireSession } = {}) {
  const router = Router();
  const sessionAuth = requireSession || ((req, res, next) => next());

  // WP1: SLO endpoints (accessible to ops monitors and sessions)
  router.get('/ops/slo', (req, res, next) => getSLOs(req, res, next));
  router.get('/ops/slo/:id', (req, res, next) => getSLOByIdHandler(req, res, next));

  // WP3: Circuit Breaker endpoint
  router.get('/ops/circuit-breakers', (req, res, next) => getCircuitBreakers(req, res, next));

  return router;
}

export default createOpsRouter;
