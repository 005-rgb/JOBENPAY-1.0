# Runbook: Webhook Processing Delayed

## Symptom
- Webhook processing latency exceeds 60 seconds (`sli_webhook_processing`).
- Webhook events in `jobs` or webhook inbox table have backlogs.
- Transaction reconciliation delayed past SLA target.

## Impact
- Payout state transition to `RECONCILED` is delayed.
- Asynchronous status updates from PayPal Sandbox lag behind real-time.

## Diagnosis
1. Inspect webhook job queue depth:
   ```sql
   SELECT count(*) FROM jobs 
   WHERE type = 'webhook_event' AND status != 'COMPLETED';
   ```
2. Check oldest pending webhook timestamp:
   ```sql
   SELECT min(created_at), max(attempts) FROM jobs 
   WHERE type = 'webhook_event' AND status != 'COMPLETED';
   ```
3. Check worker concurrency and processing rate.

## Resolution
1. **If worker concurrency is saturated:**
   - Temporarily increase `WORKER_CONCURRENCY` in config.
2. **If signature verification or external lookups are hanging:**
   - Verify certificate caching for PayPal webhook verification.
3. **If duplicate webhooks are causing replay contention:**
   - Validate deduplication key index (`idx_jobs_dedupe_key`).

## Escalation
- Escalate to Payment Ops Engineer if webhook lag exceeds 15 minutes.

## Post-Incident
- Review webhook batch processing strategy and database indexing.
