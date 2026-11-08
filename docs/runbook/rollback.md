# Rollback Plan

## Prerequisites
- Staging environment tested.
- Previous version tagged and pushed.
- Database migration is expand-only (no destructive).

## Procedure
1. **Identify last known good version:**
   ```bash
   git log --oneline -10
   ```

2. **Rollback code:**
   ```bash
   git checkout <last_good_commit>
   npm ci --omit=dev
   npm run migrate  # idempotent, no-op if already applied
   touch tmp/restart.txt  # cPanel restart
   ```

3. **Verify:**
   ```bash
   curl -s localhost:3000/healthz
   curl -s localhost:3000/readyz
   npm run judge-smoke
   ```

4. **If rollback fails:**
   - Restore from database backup (see `docs/runbook/database-restore.md`).
   - Escalate to CTO.

## Testing
- Rollback must be tested in staging **before** each production deploy.
- Rollback test is part of G4 (feature freeze) checklist.
