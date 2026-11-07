/**
 * server/src/controllers/intent_controller.js
 * PRD 1.4 Trust Infrastructure (Fase B: Intent Layer, WP3)
 * Controller endpoints for human intent mandate creation and revocation.
 */

import { createIntent, revokeIntent, getIntentMandate } from '../services/intent_service.js';

function resolveOrgId(req) {
  return req.org?.id || req.session?.current_org_id || req.user?.org_id;
}

function resolveUserId(req) {
  return req.session?.user_id || req.user?.id || req.user?.user_id;
}

export async function postIntent(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    const userId = resolveUserId(req);
    const result = await createIntent(orgId, userId, req.body);
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function postRevokeIntent(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    const intentId = req.params.intent_id || req.params.id;
    const result = await revokeIntent(orgId, intentId);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getIntentHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    const intentId = req.params.intent_id || req.params.id;
    const result = await getIntentMandate(orgId, intentId);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export default {
  postIntent,
  postRevokeIntent,
  getIntentHandler,
};
