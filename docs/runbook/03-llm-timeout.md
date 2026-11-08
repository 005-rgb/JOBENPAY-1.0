# Runbook: LLM Timeout

## Symptom
- Decision Engine Tahap D evaluation encounters timeout (> 60 seconds).
- Circuit breaker for `ai` transitions to `OPEN`.
- Requests fallback to `REQUIRE_APPROVAL` or fail-closed.

## Impact
- AI structured evaluations cannot auto-approve complex policy conditions.
- Requests require manual operator step-up approval.

## Diagnosis
1. Inspect AI circuit breaker state:
   ```bash
   curl -s http://localhost:3000/api/v1/ops/circuit-breakers | jq '.breakers[] | select(.name=="ai")'
   ```
2. Verify upstream LLM provider API status (Anthropic / OpenAI).
3. Check latency and token usage in logs:
   ```bash
   grep "AI" /var/log/jobenpay.log | tail -n 50
   ```

## Resolution
1. **If provider latency is temporarily elevated:**
   - Allow circuit breaker to cool down.
   - Verify that requests fallback to `REQUIRE_APPROVAL` without corrupting state.
2. **If provider rate limits exceeded:**
   - Check quota allocation on provider developer console.
   - Switch active provider or fallback to deterministic rules.
3. **If prompt size exceeds context budget:**
   - Review mandate extraction prompt payloads.

## Escalation
- Escalate to AI/ML Platform Engineer if AI breaker remains OPEN > 15 minutes.

## Post-Incident
- Review prompt optimization and response token limits.
- Evaluate multi-provider redundancy.
