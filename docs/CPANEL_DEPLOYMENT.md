# Manual cPanel deployment

This procedure builds the frontend locally, commits the built release to GitHub, and uses `deploy.sh` on cPanel to fetch that release and restart Passenger. The deploy script intentionally does **not** build, install dependencies, migrate the database, or seed data.

Target cPanel settings:

- Node environment: `/home/smknwon2/nodevenv/public_html/jobenpay/22`
- Application root: `/home/smknwon2/public_html/jobenpay`
- Application URL: `https://nh.jobenapp.cloud`
- Startup file: `app.cjs`
- Node.js: 22.13 or newer in the Node 22 line
- Git branch: `main`

This is a sandbox-only deployment, not authorization for real-money payouts. The application rejects PayPal live endpoints.

## 1. Protect the public web root

The requested application root is under `public_html`. Configure the cPanel Node.js application so requests are dispatched to Passenger and not served directly by Apache. After initial setup and every server configuration change, verify these paths return 403 or 404, never source contents or a 200 response:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' https://nh.jobenapp.cloud/package.json
curl -sS -o /dev/null -w '%{http_code}\n' https://nh.jobenapp.cloud/app.cjs
curl -sS -o /dev/null -w '%{http_code}\n' https://nh.jobenapp.cloud/server/src/config.js
curl -sS -o /dev/null -w '%{http_code}\n' https://nh.jobenapp.cloud/.env
curl -sS -o /dev/null -w '%{http_code}\n' https://nh.jobenapp.cloud/.git/config
```

Do not continue or enter production data if any check exposes a file. Prefer an application root outside `public_html` if the host cannot guarantee source-file isolation. Keep `.env`, uploads, backups, logs, database dumps, and private keys outside `public_html`. Enable AutoSSL for the subdomain.

## 2. Configure cPanel once

In **Setup Node.js App**, select Node 22, set the application root to `public_html/jobenpay`, URL to `nh.jobenapp.cloud`, and startup file to `app.cjs`. Use this Node environment activation path:

```sh
source /home/smknwon2/nodevenv/public_html/jobenpay/22/bin/activate
cd /home/smknwon2/public_html/jobenpay
node --version
```

The detected version must be 22.13 or newer and below 23. Configure these values in cPanel's protected environment-variable fields:

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `PUBLIC_BASE_URL` | `https://nh.jobenapp.cloud` |
| `DATABASE_URL` | PostgreSQL connection URL with `sslmode=require` or stronger |
| `DATABASE_SSL_CA` | Empty for publicly trusted certificates; otherwise provider CA PEM |
| `UPLOAD_DIR` | `/home/smknwon2/private/jobenpay/uploads` |
| `BACKUP_DIR` | `/home/smknwon2/private/jobenpay/backups` |
| `AI_PROVIDER` | `replay` (no external AI key) |
| `WORKER_ENABLED` | `1` |
| `REGISTRATION_ENABLED` | `0` |
| `AI_DAILY_BUDGET_USD` | `5` or a smaller owner-approved limit |
| `SEED_OWNER_PASSWORD`, `SEED_JUDGE_PASSWORD`, `SEED_APPROVER_PASSWORD`, `SEED_VIEWER_PASSWORD` | Unique passwords of at least 12 characters, only if initializing a new demo database |

PostgreSQL is required; cPanel MySQL/MariaDB is not a substitute. Use a reachable managed PostgreSQL instance, a database user restricted to this app, TLS, and the provider's outbound-IP allowlist. Production startup rejects a missing/non-TLS database URL, non-HTTPS public URL, missing signing/encryption secrets, and a relative or application-root upload directory.

Generate the three cryptographic secrets once using the activated Node environment:

```sh
node scripts/gen-keys.js
```

Copy the output directly into cPanel's protected fields `JOBENPAY_ENC_KEY`, `JOBENPAY_LEDGER_SIGNING_KEY`, and `JOBENPAY_HMAC_PEPPER`. Never put these in Git, a URL, a public `.env`, or support chat. Back up the keys securely and separately; do not regenerate them on routine releases.

Create private runtime directories:

```sh
mkdir -p /home/smknwon2/private/jobenpay/uploads /home/smknwon2/private/jobenpay/backups
chmod 700 /home/smknwon2/private/jobenpay /home/smknwon2/private/jobenpay/uploads /home/smknwon2/private/jobenpay/backups
```

Clone the GitHub repository into the configured application root and ensure it has an `origin` remote. Keep `.env` and any server-owned `.htaccess` untracked. Configure GitHub read access for the cPanel account using a deploy key or another least-privilege method.

### One-time runtime dependency install

The built frontend is committed to `web/dist`; cPanel does not need the frontend toolchain. Install root production dependencies once after cloning:

```sh
npm ci --omit=dev
```

Repeat this command manually only when the root `package-lock.json` or runtime dependencies change. It is intentionally not run by `deploy.sh`. The script checks required runtime dependencies and stops with instructions if they are missing.

## 3. Build and publish each release locally

On the development machine, from a clean checkout of the intended release. In Windows PowerShell, add both Laragon Node 22 and Git to the current terminal's `PATH` (this fixes `npm`/`git is not recognized` without changing machine-wide settings):

```powershell
$env:Path = "C:\laragon\bin\nodejs\node-v22;C:\laragon\bin\git\cmd;$env:Path"
node --version
npm.cmd --version
git --version
```

Confirm Node reports version 22.13 or newer in the Node 22 line. Use `npm.cmd` explicitly in PowerShell:

```powershell
npm.cmd ci
npm.cmd ci --prefix web
npm.cmd run build
npm.cmd run guard
npm.cmd run lint
npm.cmd run secret-scan
npm.cmd test
```

If Laragon installed Node or Git in different folders, replace the corresponding paths with the directories containing `node.exe`/`npm.cmd` and `git.exe`. The `PATH` change above lasts only for the current PowerShell window; reopen a terminal and repeat it when needed.

On macOS/Linux, activate the project's Node 22 environment and run:

```sh
npm ci
npm ci --prefix web
npm run build
npm run guard
npm run lint
npm run secret-scan
npm test
```

`npm run build` generates `web/dist`. Those built files are intentionally tracked and pushed with the matching source so cPanel does not need to build. Review the generated diff, then commit and push the source and build output together:

```sh
git add .gitignore package.json scripts/validate/static.js deploy.sh docs/CPANEL_DEPLOYMENT.md web/dist
git diff --cached --check
git diff --cached --stat
git commit -m "release: describe this release"
git push origin main
```

In PowerShell, use `git` after applying the PATH command above. If you prefer not to edit PATH, call Git directly with `& "C:\laragon\bin\git\cmd\git.exe" <arguments>`.

Do not commit `.env`, credentials, upload files, generated database files, or local logs. Wait for the required GitHub Actions checks to pass before deploying.

## 4. Deploy the reviewed release from cPanel

In cPanel Terminal:

```sh
source /home/smknwon2/nodevenv/public_html/jobenpay/22/bin/activate
cd /home/smknwon2/public_html/jobenpay
bash deploy.sh main
```

The script verifies Node 22.13+, fetches `origin/main`, refuses tracked local edits or tracked `.env`/`.htaccess`, protects untracked server files that collide with the release, verifies the tracked frontend build and production dependencies, and requests a Passenger restart using `tmp/restart.txt`. Logs are written to `/home/smknwon2/logs/jobenpay-deploy.log`; temporary protections are stored outside the app root with private permissions. If a check fails, the script reports the retained backup path; inspect it and the log before retrying.

The script does **not** install packages, run `npm run build`, apply migrations, seed data, or alter database contents. If runtime dependencies changed, manually run `npm ci --omit=dev` in the activated cPanel environment before invoking `deploy.sh`.

### Database migrations and first-time seed

Review migration files in the release before deploying. Database migrations are a separate, owner-controlled operation and are never run by `deploy.sh`. If a release contains a migration, sync the release without restarting the app:

```sh
bash deploy.sh main --defer-restart
```

With the cPanel environment variables available to the terminal, apply and verify the migration:

```sh
node server/scripts/migrate.js
```

Use the cPanel script runner if it inherits the protected application environment; otherwise securely load the same required values into the shell without storing them in history. Plan migrations for a maintenance window when schema compatibility requires it. After the migration succeeds, use cPanel's **Restart** action to start Passenger on the new release, then verify readiness. For releases without migrations, use the normal `bash deploy.sh main` command.

For a new synthetic demo database only, run `npm run seed` once with all four `SEED_*_PASSWORD` variables set. The seed prints a demo agent API key once; capture it securely or revoke/rotate it immediately. Never seed on routine releases.

Cron jobs do not inherit Passenger's environment. If the cPanel cron interface cannot set protected variables, store only the required exports in `/home/smknwon2/private/jobenpay/cron.env`, owned by the account with mode `600`; never place it under `public_html` or commit it.

## 5. Verify the release

```sh
curl --fail --show-error https://nh.jobenapp.cloud/healthz
curl --fail --show-error https://nh.jobenapp.cloud/readyz
```

`/readyz` requires the database, current migrations, and worker heartbeat. Repeat the source-file exposure checks, confirm uploads remain under the private upload directory, sign in with the intended owner account, and verify the ledger. Do not rely on the judge account as the sole production owner credential.

Configure cron and monitoring using [OPERATIONS.md](./OPERATIONS.md). Ensure `pg_dump` is available before enabling scheduled backups; keep backup output and cron logs outside `public_html`.
