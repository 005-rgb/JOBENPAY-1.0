# Runbook: High Latency

## Symptom
- P95 decision latency exceeds 500ms target threshold (`sli_decision_latency`).
- HTTP clients experience slow response times or connection timeouts.
- Node.js event loop lag increases significantly.

## Impact
- Customer workflows delayed. Violation of `slo_decision_latency`.
- In-flight request queues pile up, risking connection pool exhaustion.

## Diagnosis
1. Query per-tenant metrics for latency quantiles:
   ```bash
   curl -s http://localhost:3000/api/v1/ops/tenants/<org_id>/metrics | jq '{p50: .metrics.latency_p50_ms, p95: .metrics.latency_p95_ms, p99: .metrics.latency_p99_ms}'
   ```
2. Check for slow database queries via `pg_stat_activity`:
   ```sql
   SELECT pid, now() - query_start AS duration, query 
   FROM pg_stat_activity 
   WHERE state != 'idle' AND query_start < now() - interval '2 seconds';
   ```
3. Inspect external API latencies (PayPal or AI provider).

## Resolution
1. **If caused by database slow queries:**
   - Terminate blocking long-running analytical queries.
   - Verify index usage with `EXPLAIN ANALYZE`.
2. **If caused by Node.js event loop block:**
   - Inspect CPU profiling to pinpoint synchronous blocking JSON parses or hashing loops.
3. **If caused by external LLM provider:**
   - Verify AI circuit breaker and fallback mechanisms.

## Escalation
- Escalate to Backend Performance Lead if p95 exceeds 1000ms for over 15 minutes.

## Post-Incident
- Optimize queries, add missing indexes, or fine-tune caching parameters.
