/**
 * server/src/routes/intents.js
 * PRD 1.4 Trust Infrastructure (Fase B: Intent Layer, WP4)
 * RESTful API router for bounded human intent mandates.
 */

import { Router } from 'express';
import { postIntent, postRevokeIntent, getIntentHandler, listIntentsHandler } from '../controllers/intent_controller.js';

export function createIntentsRouter({ requireSession, requireRole, requireCsrf } = {}) {
  const router = Router();

  const authMiddleware = requireSession || function requireSession(req, res, next) { next(); };
  const csrfMiddleware = requireCsrf || function requireCsrf(req, res, next) { next(); };

  router.post('/intents', authMiddleware, csrfMiddleware, postIntent);
  router.get('/intents', authMiddleware, listIntentsHandler);
  router.post('/intents/:intent_id/revoke', authMiddleware, csrfMiddleware, postRevokeIntent);
  router.get('/intents/:intent_id', authMiddleware, getIntentHandler);

  return router;
}

export const intentsRouter = createIntentsRouter();
export default intentsRouter;
