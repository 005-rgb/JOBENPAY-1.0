# Operations

## Keep-alive and health monitoring

Configure these cPanel cron entries from the project directory. Keep stdout/stderr redirected to a private log location if the hosting panel captures cron output.

```cron
* * * * * curl --fail --silent --show-error https://YOUR_HOST/healthz >/dev/null
```

`/healthz` is intentionally lightweight and is suitable for a keep-alive ping. Configure an independent external monitor to request `/readyz` every five minutes and alert on any non-200 response. Readiness checks database connectivity, the latest migration, and a recent worker heartbeat.

## Judge smoke checks

Set `JUDGE_SMOKE_URL`, `JUDGE_SMOKE_EMAIL`, and `JUDGE_SMOKE_PASSWORD` in the protected process environment, not in a public document or cron command. Schedule the dry smoke check every six hours:

```cron
0 */6 * * * cd ~/jobenpay && node scripts/judge-smoke.js
```

The default mode logs in as the judge, runs one legitimate and two hostile synthetic invoice scenarios without queuing a payout, verifies the ledger, and exits nonzero on any failure. The explicit `--real` option can queue exactly one legitimate sandbox payout, so it must never be used by the scheduled check.

## Database backups and ledger exports

Set `DATABASE_URL` and `BACKUP_DIR` in the protected environment. `BACKUP_DIR` must be outside `public_html` and `www`. Schedule the custom-format PostgreSQL dump daily; the script retains the most recent seven days:

```cron
15 2 * * * cd ~/jobenpay && bash scripts/backup.sh
```

Once per week, sign in as an authorized organization member, open Ledger, and use **Export JSON**. Store the export with its organization identifier, export date, and verified ledger head hash in protected off-site storage. Never delete ledger rows to perform a demo reset.

## Release and rollback

1. Build and validate the release in CI; retain the exact artifact and migration list.
2. Upload the release, install production dependencies with `npm ci --omit=dev`, run `node server/scripts/migrate.js`, then restart the application.
3. Check `/healthz` and `/readyz`, run `node scripts/judge-smoke.js` in dry mode, and verify the ledger before declaring the release healthy.
4. If the release fails, restore the previous application artifact and restart. Migrations are forward-only; do not roll back by deleting or editing migrated data. Apply a corrective forward migration when necessary.

## Ledger signing-key rotation

Generate a new Ed25519 signing key and assign its new `kid`. Deploy verification support for both the existing public key and the new key before switching the active signing key. Sign new entries with the new key; retain every prior public key for verification of historical entries. Verify the full chain after rotation and keep a protected copy of the key inventory and backup.
