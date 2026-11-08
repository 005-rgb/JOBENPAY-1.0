# Runbook: PayPal Unavailable

## Symptom
- Payout execution requests return 503 `PAYPAL_NETWORK_ERROR`.
- Circuit breaker for `paypal` transitions to `OPEN` state.
- Alert `alert_paypal_unavailable` fires with high error rate.

## Impact
- Outbound payouts and refund captures cannot be finalized on PayPal Sandbox.
- Payment requests remain safely staged in `APPROVED` or fail-closed.

## Diagnosis
1. Inspect circuit breaker status:
   ```bash
   curl -s http://localhost:3000/api/v1/ops/circuit-breakers | jq '.breakers[] | select(.name=="paypal")'
   ```
2. Test PayPal Sandbox API endpoint directly:
   ```bash
   curl -I https://api-m.sandbox.paypal.com/v1/oauth2/token
   ```
3. Check application logs for upstream status codes (500, 503, 429):
   ```bash
   grep "PayPal" /var/log/jobenpay.log | tail -n 50
   ```

## Resolution
1. **If Circuit Breaker is OPEN due to temporary transient spike:**
   - Wait 60 seconds for the breaker to reach `HALF_OPEN`.
   - Submit a test verification probe via the simulator.
2. **If PayPal Sandbox is undergoing planned downtime:**
   - Keep circuit breaker OPEN to prevent cascading timeouts.
   - Inform impacted tenants via system banner notification.
3. **If client credentials expired or rotated incorrectly:**
   - Validate client credentials against developer portal.
   - Update environment configuration and restart gracefully.

## Escalation
- Escalate to Payment Integration Engineer if downtime exceeds 30 minutes.
- Contact PayPal Developer Support if upstream sandbox outages persist.

## Post-Incident
- Verify all pending requests are reconciled once PayPal is healthy.
- Update circuit breaker threshold if false trips occurred.
