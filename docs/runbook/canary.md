# Canary Release Procedure

## When to Use
- Changes to Decision Engine (Tahap A/B/C/D).
- Changes to Ledger.
- Changes to Payment Execution.
- Changes to JPL Compiler/Evaluator.

## Procedure
1. **Deploy to 1 pilot tenant:**
   - Set `CANARY_TENANT_IDS=org_pilot`.
   - Deploy.
   - Monitor for 30 minutes.

2. **Verify:**
   - SLO for pilot tenant: healthy.
   - No increase in error rate.
   - No double payout.
   - Latency within target.

3. **Expand to 10% tenants:**
   - Set `CANARY_PERCENTAGE=10`.
   - Monitor for 1 hour.

4. **Expand to 100%:**
   - Set `CANARY_PERCENTAGE=100`.
   - Monitor for 24 hours.

## Rollback
- If SLO degraded: revert to previous version.
- If new error: revert immediately.
