# Runbook: High Error Rate

## Symptom
- Elevated 5xx responses (> 1% of total traffic over 5 minutes).
- Alert `alert_slo_burn_rate` triggers with burn rate > 14.4.
- API gateway or load balancer logs show spikes in `HTTP 500`.

## Impact
- Degraded service availability violating `slo_decision_availability`.
- Rapid consumption of tenant and system error budgets.

## Diagnosis
1. Inspect SLO status and current burn rates:
   ```bash
   curl -s http://localhost:3000/api/v1/ops/slo | jq .
   ```
2. Check top error codes in application logs:
   ```bash
   grep -o '"code":"[^"]*"' /var/log/jobenpay.log | sort | uniq -c | sort -nr | head -n 10
   ```
3. Inspect per-tenant metrics to identify if issue is isolated to a single tenant or global:
   ```bash
   curl -s http://localhost:3000/api/v1/ops/tenants/<org_id>/metrics | jq .metrics
   ```

## Resolution
1. **If isolated to a single misbehaving tenant/agent:**
   - Throttle or temporarily disable the specific agent API key.
2. **If caused by recent deployment:**
   - Initiate immediate rollback procedure (see `docs/runbook/rollback.md`).
3. **If dependent service degraded (DB or Redis):**
   - Follow specific service recovery runbook (e.g., `01-database-down.md`).

## Escalation
- Escalate to Primary On-Call Engineer if error rate remains > 5% for more than 5 minutes.

## Post-Incident
- Review error budget depletion in weekly reliability review.
- Add regression test case covering the failure vector.
