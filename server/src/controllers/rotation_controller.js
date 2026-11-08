// @ts-check
import { rotateAgentApiKey, rotateLedgerSigningKey } from '../services/secret_rotation.js';

export async function rotateApiKey(req, res) {
  try {
    const agentId = req.params.agent_id || req.params.id || req.body?.agent_id;
    const callerOrgId = req.org?.id || req.session?.current_org_id;
    const orgId = callerOrgId || req.orgId || req.body?.org_id || req.headers['x-org-id'] || req.user?.org_id;
    const userId = req.user?.id || '00000000-0000-0000-0000-000000000000';

    if (!agentId || !orgId) {
      return res.status(400).json({ error: 'AGENT_ID_AND_ORG_ID_REQUIRED' });
    }

    const result = await rotateAgentApiKey(agentId, orgId, userId);
    return res.status(200).json(result);
  } catch (err) {
    const statusCode = err.statusCode || (err.message?.includes('not found') ? 404 : 500);
    return res.status(statusCode).json({ error: err.message });
  }
}

export async function rotateLedgerKey(req, res) {
  try {
    const callerOrgId = req.org?.id || req.session?.current_org_id;
    const orgId = callerOrgId || req.orgId || req.body?.org_id || req.headers['x-org-id'] || req.user?.org_id;
    if (!orgId) {
      return res.status(400).json({ error: 'ORG_ID_REQUIRED' });
    }

    const result = await rotateLedgerSigningKey(orgId);
    return res.status(200).json(result);
  } catch (err) {
    const statusCode = err.statusCode || (err.message?.includes('not found') ? 404 : 500);
    return res.status(statusCode).json({ error: err.message });
  }
}
