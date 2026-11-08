// @ts-check
import { getTenantMetrics } from '../services/metrics_service.js';

export async function getTenantMetricsHandler(req, res) {
  try {
    const callerOrgId = req.org?.id || req.session?.current_org_id || req.orgId;
    const requestedOrgId = req.params.org_id || req.query.org_id || callerOrgId;
    if (callerOrgId && requestedOrgId && callerOrgId !== requestedOrgId) {
      return res.status(404).json({ error: 'ORG_NOT_FOUND' });
    }
    const orgId = requestedOrgId;
    if (!orgId) {
      return res.status(400).json({ error: 'ORG_ID_REQUIRED' });
    }
    const window = typeof req.query.window === 'string' ? req.query.window : '1h';
    const metrics = await getTenantMetrics(orgId, window);
    return res.status(200).json(metrics);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export { getTenantMetricsHandler as getTenantMetrics };
