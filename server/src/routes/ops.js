// @ts-check
import { Router } from 'express';
import { getSLOs, getSLOByIdHandler } from '../controllers/slo_controller.js';
import { getCircuitBreakers } from '../controllers/circuit_breaker_controller.js';
import { getTenantMetricsHandler } from '../controllers/metrics_controller.js';
import { getAuditLog } from '../controllers/audit_controller.js';
import {
  getEntitiesHandler,
  postEntityHandler,
  getEscrowHandler,
  postEscrowHandler,
  getFailClosedMatrixHandler,
  getStateMachinesHandler,
} from '../controllers/ops_unified_controller.js';

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
  router.get('/audit', (req, res, next) => {
    if (req.cookies?.jp_sid && requireSession) {
      return requireSession(req, res, () => getAuditLog(req, res, next));
    }
    return getAuditLog(req, res, next);
  });

  // PRD 2.0 Unified Ops Endpoints (§4)
  router.get('/ops/entities', (req, res, next) => getEntitiesHandler(req, res, next));
  router.post('/ops/entities', (req, res, next) => postEntityHandler(req, res, next));
  router.get('/ops/escrow/:escrow_id', (req, res, next) => getEscrowHandler(req, res, next));
  router.post('/ops/escrow', (req, res, next) => postEscrowHandler(req, res, next));
  router.get('/ops/fail-closed-matrix', (req, res) => getFailClosedMatrixHandler(req, res));
  router.get('/ops/state-machines', (req, res) => getStateMachinesHandler(req, res));

  return router;
}

export default createOpsRouter;
