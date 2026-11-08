# Runbook: Double Payout Detected

## Symptom
- Multiple payout transactions share identical `agent_idempotency_key` or `target_ref`.
- Alert `alert_double_payout` fires with severity `critical`.
- Ledger balance discrepancy shows unexpected debit replication.

## Impact
- Direct financial risk. Immediate breach of PRD 1.3 Golden Rule #1 & #5.
- Error budget exhausted immediately to 0%.

## Diagnosis
1. Identify all transaction rows matching the target reference or idempotency key:
   ```sql
   SELECT id, org_id, agent_id, amount_minor, status, agent_idempotency_key, created_at 
   FROM payment_requests 
   WHERE agent_idempotency_key IN (
     SELECT agent_idempotency_key FROM payment_requests 
     GROUP BY agent_idempotency_key HAVING count(*) > 1
   );
   ```
2. Verify PayPal payout batch IDs on PayPal Sandbox.
3. Check database transaction isolation level on payout execution path.

## Resolution
1. **Kill Switch Activation:**
   - Immediately activate global freeze toggle:
     ```bash
     curl -X POST http://localhost:3000/api/v1/ops/freeze-all -H "X-Admin-Key: <key>"
     ```
2. **Contact Recipient / PayPal Sandbox:**
   - Void or reverse duplicate payout if un-cleared.
   - Insert compensating reversal journal entry into ledger.
3. **Patch Idempotency Guard:**
   - Verify unique constraint on `(agent_id, agent_idempotency_key)`.

## Escalation
- Escalate immediately to Executive Leadership, VP Engineering, and Legal/Compliance.

## Post-Incident
- Mandatory P0 post-mortem within 12 hours.
- Freeze all new feature releases until root cause is completely addressed and verified.
