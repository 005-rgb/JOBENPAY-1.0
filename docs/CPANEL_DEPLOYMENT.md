# cPanel deployment

This procedure prepares the sandbox-only application for the supplied cPanel account:

- Node environment: `/home/smknwon2/nodevenv/public_html/jobenpay/22`
- Application root: `/home/smknwon2/public_html/jobenpay`
- Application URL: `https://nh.jobenapp.cloud`
- Startup file: `app.cjs`
- Node.js: 22.13 or newer in the Node 22 line

This is a production-mode web deployment, **not** authorization for real-money payouts. The application rejects PayPal live endpoints and only supports PayPal Sandbox.

## Important application-root exposure check

The requested application root is under `public_html`. Configure the cPanel Node.js application so requests are dispatched to Passenger and not served directly by Apache. After setup, verify each path below returns 403 or 404, never source contents or a 200 response:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' https://nh.jobenapp.cloud/package.json
curl -sS -o /dev/null -w '%{http_code}\n' https://nh.jobenapp.cloud/app.cjs
curl -sS -o /dev/null -w '%{http_code}\n' https://nh.jobenapp.cloud/server/src/config.js
curl -sS -o /dev/null -w '%{http_code}\n' https://nh.jobenapp.cloud/.env
curl -sS -o /dev/null -w '%{http_code}\n' https://nh.jobenapp.cloud/.git/config
```

Do not continue or enter production data if any check exposes a file. Prefer moving the application root outside `public_html` if the host cannot guarantee this. Keep `.env`, uploads, backups, logs, database dumps, and private keys outside `public_html`. Enable AutoSSL for the subdomain before starting the application.

## Database and protected environment

The app requires PostgreSQL; it cannot use cPanel MySQL/MariaDB as a substitute. Provide a reachable managed PostgreSQL instance and a database user restricted to this app's database. Ensure the provider supports TLS and allowlists the cPanel server's outbound address. Production startup rejects a missing database URL, a URL without TLS, an HTTP public URL, missing signing/encryption secrets, and a relative upload directory.

In **Setup Node.js App → Environment variables**, configure:

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `PUBLIC_BASE_URL` | `https://nh.jobenapp.cloud` |
| `DATABASE_URL` | `postgresql://USER:URL_ENCODED_PASSWORD@HOST:5432/DB?sslmode=require` |
| `DATABASE_SSL_CA` | Leave empty when the provider uses a publicly trusted certificate; otherwise paste its CA PEM |
| `UPLOAD_DIR` | `/home/smknwon2/private/jobenpay/uploads` |
| `BACKUP_DIR` | `/home/smknwon2/private/jobenpay/backups` |
| `AI_PROVIDER` | `replay` (no external AI key) |
| `WORKER_ENABLED` | `1` |
| `REGISTRATION_ENABLED` | `0` |
| `AI_DAILY_BUDGET_USD` | `5` or a smaller owner-approved limit |
| `SEED_OWNER_PASSWORD`, `SEED_JUDGE_PASSWORD`, `SEED_APPROVER_PASSWORD`, `SEED_VIEWER_PASSWORD` | Unique passwords of at least 12 characters if seeding a new demo database |

Use cPanel's protected environment-variable fields for the three cryptographic secrets. Generate them in the activated Node environment and copy their values directly into those fields; never put them in Git, a URL, a public `.env`, or a support chat:

```sh
source /home/smknwon2/nodevenv/public_html/jobenpay/22/bin/activate
cd /home/smknwon2/public_html/jobenpay
node scripts/gen-keys.js
```

Store the generated values as `JOBENPAY_ENC_KEY`, `JOBENPAY_LEDGER_SIGNING_KEY`, and `JOBENPAY_HMAC_PEPPER`. Back up the keys securely and separately; losing them can make encrypted payees unreadable or prevent ledger verification. Do not regenerate keys on every deployment.

Create private runtime directories and restrict permissions:

```sh
mkdir -p /home/smknwon2/private/jobenpay/uploads /home/smknwon2/private/jobenpay/backups
chmod 700 /home/smknwon2/private/jobenpay /home/smknwon2/private/jobenpay/uploads /home/smknwon2/private/jobenpay/backups
```

## Install and initialize

Clone/deploy the reviewed `main` source into the configured application root. In cPanel Terminal:

```sh
source /home/smknwon2/nodevenv/public_html/jobenpay/22/bin/activate
cd /home/smknwon2/public_html/jobenpay
node --version
npm ci --omit=dev
npm ci --prefix web
npm --prefix web run build
```

The Node.js environment variables configured in cPanel are available to Passenger, but may not be inherited by interactive terminal commands. Before running migrations, load the same protected values into that shell without saving them in shell history, or use cPanel's Node.js script runner if it inherits the app environment:

```sh
node server/scripts/migrate.js
```

Cron jobs also do not inherit Passenger's environment. If the cPanel cron interface cannot define protected environment variables, store only the required exported values in `/home/smknwon2/private/jobenpay/cron.env`, owned by the account with mode `600`, and source that file in each cron command. Never place it in `public_html` or commit it.

For a new synthetic demo database only, run `npm run seed` once with all four `SEED_*_PASSWORD` variables set to unique private values. The seed prints a demo agent API key once; capture it securely or revoke/rotate it immediately. Do not run seed as a routine update. Restart the application from cPanel after each release; migrations are forward-only.

In **Setup Node.js App**, set the application URL to `nh.jobenapp.cloud`, startup file to `app.cjs`, and Node version to 22. Use the cPanel restart action after dependencies, build, migrations, or environment variables change.

## Verify after restart

```sh
curl --fail --show-error https://nh.jobenapp.cloud/healthz
curl --fail --show-error https://nh.jobenapp.cloud/readyz
```

`/readyz` requires the database, current migrations, and worker heartbeat. Also verify the source-file exposure checks above, sign in with the intended owner account, check document uploads remain under the private upload directory, and verify the ledger. Do not use the judge account as the sole production owner credential.

Configure cron and monitoring using [OPERATIONS.md](./OPERATIONS.md). Ensure `pg_dump` is available before enabling scheduled backups. Keep backup output and cron logs outside `public_html`.

## Release boundary

The CI workflow must pass before updating the cPanel checkout. Confirm the application root has no local edits, fast-forward to the reviewed `main` commit, install/build, apply migrations, restart, and check readiness. If readiness fails, restore the previous application files and fix forward database changes; never delete ledger entries or roll back migrations by editing history.
