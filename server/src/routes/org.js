// @ts-check
import { Router } from 'express';
import { rotateLedgerKey } from '../controllers/rotation_controller.js';

export function createOrgRouter({ requireSession } = {}) {
  const router = Router();

  router.post('/org/ledger-keys/rotate', (req, res, next) => {
    if (req.cookies?.jp_sid && requireSession) {
      return requireSession(req, res, () => rotateLedgerKey(req, res));
    }
    return rotateLedgerKey(req, res);
  });

  return router;
}

export const orgRouter = createOrgRouter();
export default orgRouter;
