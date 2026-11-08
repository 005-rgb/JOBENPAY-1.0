// @ts-check
import { listEntities, registerEntity } from '../services/entity_service.js';
import { createEscrow, getEscrow } from '../services/escrow_service.js';
import { FAIL_CLOSED_MATRIX } from '../../../shared/fail-closed.js';
import { AppError } from '../lib/errors.js';

export function resolveOrgId(req) {
  return (
    req.org?.id ||
    req.session?.current_org_id ||
    req.session?.org_id ||
    req.user?.org_id ||
    req.headers?.['x-org-id'] ||
    req.query?.org_id ||
    req.body?.org_id ||
    null
  );
}

export async function getEntitiesHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) {
      throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
    }
    const limit = parseInt(req.query.limit, 10) || 20;
    const cursor = req.query.cursor || null;
    const result = await listEntities(orgId, { cursor, limit });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function postEntityHandler(req, res, next) {
  try {
    const orgId = req.body?.org_id || resolveOrgId(req);
    if (!orgId) {
      throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
    }
    const entity = await registerEntity(orgId, req.body);
    res.status(201).json({
      entity_id: entity.entity_id,
      status: entity.status,
      created_at: entity.created_at,
    });
  } catch (err) {
    next(err);
  }
}

export async function getEscrowHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) {
      throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
    }
    const escrowId = req.params.escrow_id;
    const escrow = await getEscrow(orgId, escrowId);
    res.status(200).json(escrow);
  } catch (err) {
    next(err);
  }
}

export async function postEscrowHandler(req, res, next) {
  try {
    const orgId = req.body?.org_id || resolveOrgId(req);
    if (!orgId) {
      throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
    }
    const result = await createEscrow(orgId, {
      escrowType: req.body?.escrow_type,
      contractId: req.body?.contract_id,
      splitId: req.body?.split_id,
      dpId: req.body?.dp_id,
      heldMinor: req.body?.held_minor,
    });
    res.status(201).json({
      escrow_id: result.escrow_id,
      status: result.status,
      created_at: result.created_at,
    });
  } catch (err) {
    next(err);
  }
}

export function getFailClosedMatrixHandler(_req, res) {
  res.status(200).json({ matrix: FAIL_CLOSED_MATRIX });
}
