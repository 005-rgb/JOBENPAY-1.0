// @ts-check
import { Router } from 'express';
import { rotateApiKey } from '../controllers/rotation_controller.js';

export function createAgentsRouter({ requireSession } = {}) {
  const router = Router();

  router.post('/agents/:agent_id/keys/rotate', (req, res, next) => {
    if (req.cookies?.jp_sid) {
      return next();
    }
    return rotateApiKey(req, res);
  });

  return router;
}

export const agentsRouter = createAgentsRouter();
export default agentsRouter;
