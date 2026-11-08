# Runbook: Worker Stuck

## Symptom
- `/readyz` returns HTTP 503 with `checks.worker_heartbeat: false`.
- Background jobs remain in `locked_until` or `attempts` count ceases to increment.
- Scheduled approval expirations and ledger cleanups are delayed.

## Impact
- Background task queue processing stalls.
- Approvals past expiry remain pending until worker resumes.

## Diagnosis
1. Check worker heartbeat status via health endpoint:
   ```bash
   curl -s http://localhost:3000/readyz | jq .checks.worker_heartbeat
   ```
2. Inspect jobs table for lingering locked jobs:
   ```sql
   SELECT id, type, dedupe_key, attempts, locked_until, created_at 
   FROM jobs WHERE status != 'COMPLETED' ORDER BY created_at DESC LIMIT 20;
   ```
3. Check worker event loop lag and process CPU usage.

## Resolution
1. **If worker loop crashed silently:**
   - Restart the application instance gracefully:
     ```bash
     touch tmp/restart.txt
     ```
2. **If a poison pill job causes crash loops:**
   - Identify the offending job ID from `last_error`.
   - Quarantine the job:
     ```sql
     UPDATE jobs SET status = 'FAILED' WHERE id = '<poison_job_id>';
     ```
3. **If advisory lock deadlock occurs:**
   - Clear stale job locks:
     ```sql
     UPDATE jobs SET locked_until = NULL WHERE locked_until < now();
     ```

## Escalation
- Escalate to Backend Core Engineer if worker does not recover after restart.

## Post-Incident
- Review job error handling and exponential backoff retry parameters.
