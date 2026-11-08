// @ts-check
import { Router } from 'express';
import { rotateLedgerKey } from '../controllers/rotation_controller.js';

export const orgRouter = Router();
orgRouter.post('/org/ledger-keys/rotate', rotateLedgerKey);

export default orgRouter;
