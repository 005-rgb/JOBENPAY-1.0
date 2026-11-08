# Exception Tracking

Setiap pengecualian harus memiliki:
- **ID:** EXC-001
- **Description:** Apa yang dikecualikan.
- **Reason:** Mengapa dikecualikan.
- **Owner:** Siapa yang bertanggung jawab.
- **Mitigation:** Apa yang dilakukan untuk mengurangi risiko.
- **Expiry:** Kapan pengecualian harus diselesaikan.

## Active Exceptions

### EXC-001: No circuit breaker for SMTP
- **Description:** SMTP calls have no circuit breaker.
- **Reason:** Low priority; SMTP rarely fails.
- **Owner:** @backend-lead
- **Mitigation:** Timeout 10s; retry 3x.
- **Expiry:** 2026-12-07

### EXC-002: No distributed tracing in production
- **Description:** OpenTelemetry not yet deployed.
- **Reason:** Tier B; deferred.
- **Owner:** @observability-lead
- **Mitigation:** Prometheus + logs sufficient for now.
- **Expiry:** 2027-01-07
