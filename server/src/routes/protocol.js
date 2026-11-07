// @ts-check
import express from 'express';
import {
  postVerifyReceipt,
  getVerifyReceipt,
  postVerifyBatch,
  postHandshakeInitiate,
  postHandshakeRespond,
  getHandshake,
  getRevocations,
  postRevocationSubscribe,
  getProtocolVersionsHandler,
  getConformanceVectorsHandler,
  getProtocolHtml,
  getProofHandler,
  createProofHandler,
  listProofsHandler,
  revokeProofHandler,
} from '../controllers/protocol_controller.js';

/**
 * Creates the public Open Trust Exchange router.
 * Mounted at `/v1` (and `/api/v1` for backward compatibility).
 */
export function createPublicProtocolRouter() {
  const router = express.Router();

  // 5.1 Verification
  router.post('/v1/verify/receipt', postVerifyReceipt);
  router.get('/v1/verify/receipt/:sar_id', getVerifyReceipt);
  router.post('/v1/verify/batch', postVerifyBatch);

  // 5.2 Handshake
  router.post('/v1/handshake/initiate', postHandshakeInitiate);
  router.post('/v1/handshake/:handshake_id/respond', postHandshakeRespond);
  router.get('/v1/handshake/:handshake_id', getHandshake);

  // 5.3 Revocation Feed
  router.get('/v1/revocations', getRevocations);
  router.post('/v1/revocations/subscribe', postRevocationSubscribe);

  // 5.4 Protocol Versioning & Conformance
  router.get('/v1/protocol/versions', getProtocolVersionsHandler);
  router.get('/v1/protocol/conformance/vectors', getConformanceVectorsHandler);

  return router;
}

/**
 * Creates the authenticated tenant proofs router.
 * Mounted at `/api/v1/proofs`.
 */
export function createTenantProofsRouter({ requireSession, requireRole, requireCsrf }) {
  const router = express.Router();

  router.post(
    '/proofs',
    requireSession,
    requireRole('OWNER', 'ADMIN', 'OPERATOR', 'APPROVER'),
    createProofHandler,
  );

  router.get(
    '/proofs',
    requireSession,
    requireRole('OWNER', 'ADMIN', 'OPERATOR', 'APPROVER', 'VIEWER', 'JUDGE'),
    listProofsHandler,
  );

  router.delete(
    '/proofs/:proof_id',
    requireSession,
    requireRole('OWNER', 'ADMIN'),
    revokeProofHandler,
  );

  return router;
}

export { getProtocolHtml, getProofHandler };

export default {
  createPublicProtocolRouter,
  createTenantProofsRouter,
  getProtocolHtml,
  getProofHandler,
};
