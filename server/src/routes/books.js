/**
 * server/src/routes/books.js
 * Books & Trial Balance Endpoint (PRD-R §6.5 / BW-08)
 */

import express from 'express';
import { verifyJournal } from '../domain/journal.js';

const router = express.Router();

router.get('/books', async (req, res, next) => {
  try {
    const orgId = req.org?.id ?? req.query.orgId;
    if (!orgId) {
      return res.status(400).json({ error: 'orgId required' });
    }

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
