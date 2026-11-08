# Runbook: Circuit Breaker Open

## Symptom
- One or more circuit breakers report state `OPEN`.
- Endpoints calling external services return immediate fail-fast error `Circuit <name> is OPEN`.
- Alert `alert_circuit_breaker_open` fires.

## Impact
- Outbound requests to affected integration (PayPal or AI) are fast-failed without network delay.
- Dependent flows fail-closed or fall back to safe default handling.

## Diagnosis
1. Inspect all circuit breaker states:
   ```bash
   curl -s http://localhost:3000/api/v1/ops/circuit-breakers | jq .
   ```
2. Determine failure cause:
   - For `paypal`: network timeout, HTTP 5xx, or invalid credentials.
   - For `ai`: model timeout, quota exhaustion, or schema parse failure.
3. Check `next_attempt` timestamp indicating when half-open probe will be allowed.

## Resolution
1. **If upstream service has recovered:**
   - Wait for `resetTimeout` (60s for PayPal, 120s for AI) to allow automated probe.
   - Or manually issue probe test request to verify health.
2. **If upstream outage is ongoing:**
   - Maintain OPEN state to protect internal resource pools.
   - Queue background tasks for retry when circuit closes.
3. **If breaker tripped erroneously:**
   - Adjust `failureThreshold` or `timeout` settings if traffic pattern has legitimate high latency.

## Escalation
- Escalate to Integration On-Call if breaker remains OPEN for > 30 minutes.

## Post-Incident
- Review upstream vendor SLA and incident report.
- Fine-tune breaker failure thresholds.
