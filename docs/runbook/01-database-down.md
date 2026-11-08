# Runbook: Database Down

## Symptom
- `/readyz` returns HTTP 503 with `checks.database: false`.
- Service logs show `ECONNREFUSED`, `ETIMEDOUT`, or connection pool acquisition timeouts.
- API requests fail with HTTP 503 or 500 error responses.

## Impact
- All transaction state transitions and evaluations are halted.
- Double-entry ledger writes cannot execute.
- In-flight operations fail-closed.

## Diagnosis
1. Verify direct PostgreSQL connectivity from the host:
   ```bash
   psql "$DATABASE_URL" -c "SELECT 1"
   ```
2. Check database process status:
   ```bash
   systemctl status postgresql
   ```
3. Check active connection pool count:
   ```bash
   curl -s http://localhost:3000/readyz | jq .
   ```
4. Check PostgreSQL error logs:
   ```bash
   tail -n 100 /var/log/postgresql/postgresql.log
   ```

## Resolution
1. **If PostgreSQL service is stopped:**
   - Restart the database daemon:
     ```bash
     sudo systemctl restart postgresql
     ```
   - Check disk space if restart fails:
     ```bash
     df -h
     ```
2. **If connection pool is saturated:**
   - Terminate lingering idle connections:
     ```sql
     SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
     WHERE state = 'idle' AND state_change < now() - interval '10 minutes';
     ```
3. **If network or firewall issue:**
   - Verify local listening port:
     ```bash
     ss -tlpn | grep 5432
     ```

## Escalation
- If connectivity is not restored within 10 minutes, escalate to On-Call Database Reliability Engineer.
- If storage corruption or unrecoverable disk error is suspected, escalate immediately to Lead Architect and CTO.

## Post-Incident
- Conduct post-mortem review within 24 hours.
- Verify that double-entry ledger chain remains cryptographically sound.
- Review max pool connection settings and alerting thresholds.
