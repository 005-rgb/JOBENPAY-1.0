/**
 * server/src/controllers/vlei_controller.js
 * PRD 1.4 Trust Infrastructure (Fase A: vLEI Integration, WP3)
 * Controller endpoints for vLEI identity linking and status inspection.
 */

import { linkVlei, getVleiStatus } from '../services/vlei_service.js';

function resolveOrgId(req) {
  return req.org?.id || req.session?.current_org_id || req.user?.org_id;
}

export async function postVleiLink(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    const result = await linkVlei(orgId, req.body);
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getVleiStatusHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    const result = await getVleiStatus(orgId);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export default {
  postVleiLink,
  getVleiStatusHandler,
};
