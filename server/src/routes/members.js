// @ts-check
import { Router } from 'express';
import { AppError } from '../lib/errors.js';
import {
  listMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  listInvitations,
  revokeInvitation,
} from '../services/member_service.js';

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

export function createMembersRouter({ requireSession, requireRole, requireCsrf } = {}) {
  const router = Router();

  const authMiddleware = requireSession || function requireSession(req, res, next) { next(); };
  const csrfMiddleware = requireCsrf || function requireCsrf(req, res, next) { next(); };
  const roleMiddleware = requireRole ? requireRole('OWNER', 'ADMIN') : ((req, res, next) => next());

  // GET /api/v1/members
  router.get('/', authMiddleware, roleMiddleware, async (req, res, next) => {
    try {
      const orgId = resolveOrgId(req);
      const members = await listMembers(orgId);
      return res.status(200).json({ members, total: members.length });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/members/invitations
  router.get('/invitations', authMiddleware, roleMiddleware, async (req, res, next) => {
    try {
      const orgId = resolveOrgId(req);
      const invitations = await listInvitations(orgId);
      return res.status(200).json({ invitations });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/members/invite
  router.post('/invite', authMiddleware, csrfMiddleware, roleMiddleware, async (req, res, next) => {
    try {
      const orgId = resolveOrgId(req);
      const userId = resolveUserId(req);
      const stepUpGrantId = req.get('x-step-up-grant') || req.body?.step_up_grant_id || null;
      const { email, role } = req.body || {};
      const result = await inviteMember(orgId, userId, email, role, stepUpGrantId);
      return res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/v1/members/:id/role
  router.patch('/:id/role', authMiddleware, csrfMiddleware, roleMiddleware, async (req, res, next) => {
    try {
      const orgId = resolveOrgId(req);
      const userId = resolveUserId(req);
      const stepUpGrantId = req.get('x-step-up-grant') || req.body?.step_up_grant_id || null;
      const { role } = req.body || {};
      const result = await updateMemberRole(orgId, req.params.id, role, userId, stepUpGrantId);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/v1/members/:id
  router.delete('/:id', authMiddleware, csrfMiddleware, roleMiddleware, async (req, res, next) => {
    try {
      const orgId = resolveOrgId(req);
      const userId = resolveUserId(req);
      const stepUpGrantId = req.get('x-step-up-grant') || req.body?.step_up_grant_id || null;
      await removeMember(orgId, req.params.id, userId, stepUpGrantId);
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/v1/members/invitations/:id
  router.delete('/invitations/:id', authMiddleware, csrfMiddleware, roleMiddleware, async (req, res, next) => {
    try {
      const orgId = resolveOrgId(req);
      const userId = resolveUserId(req);
      const result = await revokeInvitation(orgId, req.params.id, userId);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const membersRouter = createMembersRouter();
export default membersRouter;
