// @ts-check
import { Router } from 'express';
import { query } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { getCognitiveSnapshot, listCognitiveSnapshots } from '../services/snapshot_service.js';
import {
  evaluateCplForRequest,
  getLatestReplayResult,
} from '../services/cpl_service.js';

function resolveOrgId(req) {
  return req.org?.id || req.session?.current_org_id || req.user?.org_id || req.body?.org_id;
}

async function assertRequestBelongsToOrg(requestId, orgId) {
  const reqRes = await query(
    'SELECT org_id FROM payment_requests WHERE id = $1',
    [requestId],
  );
  if (reqRes.rows.length > 0) {
    if (reqRes.rows[0].org_id !== orgId) {
      throw new AppError('REQUEST_NOT_FOUND', 404, `Payment request not found: ${requestId}`);
    }
    return;
  }
  const snapRes = await query(
    'SELECT org_id FROM cognitive_snapshots WHERE request_id = $1',
    [requestId],
  );
  if (snapRes.rows.length > 0) {
    if (snapRes.rows[0].org_id !== orgId) {
      throw new AppError('REQUEST_NOT_FOUND', 404, `Payment request not found: ${requestId}`);
    }
    return;
  }
  throw new AppError('REQUEST_NOT_FOUND', 404, `Payment request not found: ${requestId}`);
}

export function createCplRouter({ requireSession, requireCsrf } = {}) {
  const router = Router();
  const sessionAuth = requireSession || ((req, res, next) => next());
  const csrfMiddleware = requireCsrf || function requireCsrf(req, res, next) { next(); };

  // 0. GET /api/v1/cpl/snapshots - List snapshots for org
  router.get('/cpl/snapshots', sessionAuth, async (req, res, next) => {
    try {
      const orgId = resolveOrgId(req);
      if (!orgId) {
        throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
      }

      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Number(req.query.offset) || 0;
      const snapshots = await listCognitiveSnapshots(orgId, { limit, offset });
      return res.status(200).json({ snapshots });
    } catch (err) {
      next(err);
    }
  });

  // 1. GET /api/v1/requests/:id/snapshot (PRD 1.7 §8.1)
  router.get('/requests/:id/snapshot', sessionAuth, async (req, res, next) => {
    try {
      const orgId = resolveOrgId(req);
      if (!orgId) {
        throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
      }
      await assertRequestBelongsToOrg(req.params.id, orgId);

      const snapshot = await getCognitiveSnapshot(req.params.id, orgId);
      if (!snapshot) {
        throw new AppError('SNAPSHOT_NOT_FOUND', 404, `No cognitive snapshot found for request ${req.params.id}`);
      }

      return res.status(200).json(snapshot);
    } catch (err) {
      next(err);
    }
  });

  // 2. POST /api/v1/requests/:id/replay (PRD 1.7 §8.2)
  router.post('/requests/:id/replay', sessionAuth, csrfMiddleware, async (req, res, next) => {
    try {
      const orgId = resolveOrgId(req);
      if (!orgId) {
        throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
      }
      await assertRequestBelongsToOrg(req.params.id, orgId);

      const evalResult = await evaluateCplForRequest(req.params.id, orgId, req.body || {});
      if (!evalResult.available) {
        return res.status(200).json({
          available: false,
          reproducibility_score: 0,
          decision: evalResult.decision,
          reason_codes: evalResult.reason_codes,
          components: evalResult.components,
        });
      }

      return res.status(200).json({
        replay_id: evalResult.replay_id,
        reproducibility_score: evalResult.reproducibility_score,
        components: evalResult.components,
        decision: evalResult.decision,
        replayed_at: evalResult.replayed_at,
      });
    } catch (err) {
      next(err);
    }
  });

  // 3. GET /api/v1/requests/:id/replay (PRD 1.7 §8.3)
  router.get('/requests/:id/replay', sessionAuth, async (req, res, next) => {
    try {
      const orgId = resolveOrgId(req);
      if (!orgId) {
        throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
      }
      await assertRequestBelongsToOrg(req.params.id, orgId);

      const latest = await getLatestReplayResult(req.params.id, orgId);
      if (latest) {
        return res.status(200).json({
          replay_id: latest.replay_id,
          reproducibility_score: latest.reproducibility_score,
          components: latest.components,
          decision: latest.decision,
          replayed_at: latest.replayed_at,
        });
      }

      // If not yet replayed, run replay evaluation
      const evalResult = await evaluateCplForRequest(req.params.id, orgId);
      return res.status(200).json({
        replay_id: evalResult.replay_id,
        reproducibility_score: evalResult.reproducibility_score,
        components: evalResult.components,
        decision: evalResult.decision,
        replayed_at: evalResult.replayed_at,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export default createCplRouter;
