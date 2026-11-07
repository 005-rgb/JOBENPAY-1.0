// @ts-check
import { Router } from 'express';
import { AppError } from '../lib/errors.js';
import { getOrgProfile, updateOrgProfile, updateOrgLogo } from '../services/organization_service.js';

function resolveOrgId(req) {
  const orgId = req.org?.id ?? req.session?.current_org_id ?? req.user?.org_id;
  if (!orgId) {
    throw new AppError('UNAUTHENTICATED', 401, 'Organization context required');
  }
  return orgId;
}

function resolveUserId(req) {
  const userId = req.user?.id ?? req.session?.user_id;
  if (!userId) {
    throw new AppError('UNAUTHENTICATED', 401, 'User context required');
  }
  return userId;
}

export function createOrganizationRouter({ requireSession, requireRole, requireCsrf } = {}) {
  const router = Router();

  const authMiddleware = requireSession || function requireSession(req, res, next) { next(); };
  const csrfMiddleware = requireCsrf || function requireCsrf(req, res, next) { next(); };
  const roleMiddleware = requireRole ? requireRole('OWNER', 'ADMIN') : ((req, res, next) => next());

  // GET /api/v1/org/profile
  router.get('/org/profile', authMiddleware, roleMiddleware, async (req, res, next) => {
    try {
      const orgId = resolveOrgId(req);
      const profile = await getOrgProfile(orgId);
      return res.status(200).json(profile);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/v1/org/profile
  router.patch('/org/profile', authMiddleware, csrfMiddleware, roleMiddleware, async (req, res, next) => {
    try {
      const orgId = resolveOrgId(req);
      const userId = resolveUserId(req);
      const stepUpGrantId = req.get('x-step-up-grant') || req.body?.step_up_grant_id || null;
      const payload = { ...req.body, step_up_grant_id: stepUpGrantId };
      const updated = await updateOrgProfile(orgId, userId, payload);
      return res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/org/logo
  router.post('/org/logo', authMiddleware, csrfMiddleware, roleMiddleware, async (req, res, next) => {
    try {
      const orgId = resolveOrgId(req);
      const userId = resolveUserId(req);
      const logoUrl = req.body?.logo_url || req.body?.logoUrl;
      const updated = await updateOrgLogo(orgId, userId, logoUrl);
      return res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const organizationRouter = createOrganizationRouter();
export default organizationRouter;
