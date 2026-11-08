// @ts-check
import { getTenantMetrics } from '../services/metrics_service.js';

export async function getTenantMetricsHandler(req, res) {
  try {
    const orgId = req.params.org_id || req.query.org_id || req.orgId;
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
