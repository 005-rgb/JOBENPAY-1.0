// @ts-check
import { Router } from 'express';
import { getSLOs, getSLOByIdHandler } from '../controllers/slo_controller.js';
import { getCircuitBreakers } from '../controllers/circuit_breaker_controller.js';
import { getTenantMetricsHandler } from '../controllers/metrics_controller.js';
import { getAuditLog } from '../controllers/audit_controller.js';

export function createOpsRouter({ requireSession } = {}) {
  const router = Router();
  const sessionAuth = requireSession || ((req, res, next) => next());

  // WP1: SLO endpoints
  router.get('/ops/slo', (req, res, next) => getSLOs(req, res, next));
  router.get('/ops/slo/:id', (req, res, next) => getSLOByIdHandler(req, res, next));

  // WP3: Circuit Breaker endpoint
  router.get('/ops/circuit-breakers', (req, res, next) => getCircuitBreakers(req, res, next));

  // WP4: Per-tenant metrics + audit log
  router.get('/ops/tenants/:org_id/metrics', (req, res, next) => getTenantMetricsHandler(req, res, next));
  router.get('/audit', (req, res, next) => getAuditLog(req, res, next));

  return router;
}

export default createOpsRouter;
