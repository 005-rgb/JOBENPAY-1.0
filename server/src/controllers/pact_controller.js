/**
 * server/src/controllers/pact_controller.js
 * PRD 1.4 Trust Infrastructure (Fase C: PACT Arbitration & Bonding, WP4)
 *
 * Controller endpoints for PACT contracts, escrow funding, delivery,
 * verification, settlement, and disputes.
 */

import { AppError } from '../lib/errors.js';
import {
  createContract,
  deliverWork,
  disputeContract,
  fundEscrow,
  getContract,
  settleEscrow,
  verifyWork,
} from '../services/pact_service.js';

function resolveOrgId(req) {
  const orgId = req.org?.id ?? req.session?.current_org_id ?? req.user?.org_id;
  if (!orgId) {
    throw new AppError('UNAUTHENTICATED', 401, 'Organization context required');
  }
  return orgId;
}

export async function postContract(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    const contract = await createContract(orgId, req.body);
    return res.status(201).json({
      contract_id: contract.contract_id,
      status: contract.status,
    });
  } catch (error) {
    return next(error);
  }
}

export async function postFund(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    const contractId = req.params.id;
    const result = await fundEscrow(contractId, orgId);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function postDeliver(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    const contractId = req.params.id;
    const result = await deliverWork(contractId, orgId, req.body?.work_attestation);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function postVerify(req, res, next) {
  try {
    const contractId = req.params.id;
    const { verifier_id, verdict, attestation } = req.body || {};
    const result = await verifyWork(contractId, verifier_id, verdict, attestation);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function postSettle(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    const contractId = req.params.id;
    const result = await settleEscrow(contractId, orgId);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function postDispute(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    const contractId = req.params.id;
    const result = await disputeContract(contractId, req.body?.fraud_proof, orgId);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getContractHandler(req, res, next) {
  try {
    const orgId = resolveOrgId(req);
    const contractId = req.params.id;
    const contract = await getContract(contractId, orgId);
    return res.status(200).json(contract);
  } catch (error) {
    return next(error);
  }
}
