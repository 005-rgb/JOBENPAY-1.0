# Runbook: Ledger Verification Failed

## Symptom
- Periodic or manual ledger verification returns `valid: false`.
- Error code `LEDGER_CHAIN_BROKEN` or `HASH_MISMATCH` is raised.
- Audit alert `alert_ledger_integrity` fires.

## Impact
- System integrity compromised; double-entry ledger tamper detection triggered.
- Further ledger writes for affected organization must be frozen immediately.

## Diagnosis
1. Execute ledger verification script on specific tenant:
   ```bash
   node server/scripts/verify-ledger.js --org-id=<org_id>
   ```
2. Identify the entry index where `prev_hash != calculated_hash`:
   ```sql
   SELECT entry_id, sequence_number, prev_hash, current_hash, created_at 
   FROM ledger_entries WHERE org_id = $1 ORDER BY sequence_number ASC;
   ```
3. Check database mutation logs for unauthorized direct writes outside `withTx`.

## Resolution
1. **Freeze Tenant:**
   - Immediately set tenant freeze status to prevent new mutations:
     ```bash
     curl -X POST http://localhost:3000/api/v1/org/freeze -H "Authorization: Bearer <admin_token>"
     ```
2. **Audit Ledger Delta:**
   - Compare entry with SAR payload and transaction journal entries.
   - Verify whether issue is an uncommitted rollback or database level tampering.
3. **Restore / Re-anchor Chain:**
   - If hardware bit-rot, restore from verified point-in-time cryptographic backup.

## Escalation
- Escalate immediately (Severity 1) to Chief Information Security Officer (CISO) and Lead Ledger Architect.

## Post-Incident
- Conduct full forensic audit of database access logs.
- Publish incident report to tenant audit committee.
