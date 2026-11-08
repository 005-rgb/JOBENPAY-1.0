// @ts-check
import { queryAuditLog } from '../services/audit_service.js';

export async function getAuditLog(req, res) {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.query.org_id || req.orgId || req.user?.org_id;
    if (!orgId) {
      return res.status(400).json({ error: 'ORG_ID_REQUIRED' });
    }

    const filters = {
      user_id: req.query.user_id,
      action: req.query.action,
      from: req.query.from,
      to: req.query.to,
    };
    const cursor = req.query.cursor || null;
    const limit = req.query.limit || 100;

    const result = await queryAuditLog(orgId, filters, cursor, limit);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export default getAuditLog;
