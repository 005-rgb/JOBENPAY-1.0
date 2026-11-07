/**
 * server/src/routes/books.js
 * Books & Trial Balance Endpoint (PRD-R §6.5 / BW-08)
 */

import express from 'express';
import { verifyJournal } from '../domain/journal.js';

const router = express.Router();

router.get(['/', '/books'], async (req, res, next) => {
  try {
    const orgId = req.org?.id ?? req.query.orgId ?? req.session?.current_org_id ?? '00000000-0000-4000-8000-000000000001';

    const proof = await verifyJournal(orgId);
    return res.json({
      status: 'ok',
      orgId,
      verified: proof.verified,
      trialBalance: proof.balanceByCurrency,
      asOf: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
