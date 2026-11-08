// @ts-check
import { Router } from 'express';
import { rotateApiKey } from '../controllers/rotation_controller.js';

export const agentsRouter = Router();
agentsRouter.post('/agents/:agent_id/keys/rotate', rotateApiKey);

export default agentsRouter;
