/**
 * server/src/routes/trust.js
 * PRD 1.4 Trust Infrastructure (Fase A: vLEI Integration, WP4)
 * RESTful API router for organizational vLEI credential management.
 */

import { Router } from 'express';
import { postVleiLink, getVleiStatusHandler } from '../controllers/vlei_controller.js';

export function createTrustRouter({ requireSession, requireRole, requireCsrf } = {}) {
  const router = Router();

  const authMiddleware = requireSession || function requireSession(req, res, next) { next(); };
  const csrfMiddleware = requireCsrf || function requireCsrf(req, res, next) { next(); };
  const roleMiddleware = requireRole ? requireRole('OWNER', 'ADMIN') : ((req, res, next) => next());

  router.post('/vlei/link', authMiddleware, csrfMiddleware, roleMiddleware, postVleiLink);
  router.get('/vlei/status', authMiddleware, getVleiStatusHandler);

  return router;
}

export const trustRouter = createTrustRouter();
export default trustRouter;

