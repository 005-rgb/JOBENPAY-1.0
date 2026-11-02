# Manual cPanel deployment

This procedure builds the frontend locally, commits the built release to GitHub, and uses `deploy.sh` on cPanel to fetch that release and restart Passenger. The deploy script intentionally does **not** build, install dependencies, migrate the database, or seed data.

Target cPanel settings:

- Node environment: `/home/smknwon2/nodevenv/public_html/jobenpay/22`
- Application root: `/home/smknwon2/public_html/jobenpay`
- Application URL: `https://nh.jobenapp.cloud`
- Startup file: `app.js`
- Node.js: 22.13 or newer in the Node 22 line
- Git branch: `main`

This is a sandbox-only deployment, not authorization for real-money payouts. The application rejects PayPal live endpoints.

## 1. Protect the public web root

The requested application root is under `public_html`. Configure the cPanel Node.js application so requests are dispatched to Passenger and not served directly by Apache. After initial setup and every server configuration change, verify these paths return 403 or 404, never source contents or a 200 response:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' https://nh.jobenapp.cloud/package.json
curl -sS -o /dev/null -w '%{http_code}\n' https://nh.jobenapp.cloud/app.js
curl -sS -o /dev/null -w '%{http_code}\n' https://nh.jobenapp.cloud/app.cjs
curl -sS -o /dev/null -w '%{http_code}\n' https://nh.jobenapp.cloud/node_modules/
curl -sS -o /dev/null -w '%{http_code}\n' https://nh.jobenapp.cloud/server/src/config.js
curl -sS -o /dev/null -w '%{http_code}\n' https://nh.jobenapp.cloud/.env
curl -sS -o /dev/null -w '%{http_code}\n' https://nh.jobenapp.cloud/.git/config
```

Do not continue or enter production data if any check exposes a file. Prefer an application root outside `public_html` if the host cannot guarantee source-file isolation. Keep `.env`, uploads, backups, logs, database dumps, and private keys outside `public_html`. Enable AutoSSL for the subdomain.

## 2. Configure cPanel once

In **Setup Node.js App**, select Node 22, set the application root to `public_html/jobenpay`, URL to `nh.jobenapp.cloud`, and startup file to `app.js`. `app.js` is the cPanel/Passenger entrypoint; `app.cjs` remains a compatibility wrapper for the existing `npm start` and Docker commands. Use this Node environment activation path:

The HTTP server does not bind to `localhost` only: `app.listen(port)` uses Node's wildcard address when no host is specified. `PUBLIC_BASE_URL` configures generated public links and must be the HTTPS domain. Passenger/domain routing still has to be enabled in cPanel; changing PostgreSQL `sslmode` affects only the app-to-database connection, not browser access to the site.

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
| `DATABASE_URL` | PostgreSQL URL; remote hosts require `sslmode=require` or stronger. Local `localhost` may use `sslmode=disable` if cPanel PostgreSQL does not support TLS. |
| `DATABASE_SSL_CA` | Empty for publicly trusted certificates; otherwise provider CA PEM |
| `UPLOAD_DIR` | `/home/smknwon2/private/jobenpay/uploads` |
| `BACKUP_DIR` | `/home/smknwon2/private/jobenpay/backups` |
| `AI_PROVIDER` | `replay` (no external AI key) |
| `WORKER_ENABLED` | `1` |
| `REGISTRATION_ENABLED` | `0` |
| `AI_DAILY_BUDGET_USD` | `5` or a smaller owner-approved limit |
| `SEED_OWNER_PASSWORD`, `SEED_JUDGE_PASSWORD`, `SEED_APPROVER_PASSWORD`, `SEED_VIEWER_PASSWORD` | Unique passwords of at least 12 characters, only if initializing a new demo database |

PostgreSQL is required; cPanel MySQL/MariaDB is not a substitute. Remote PostgreSQL connections must use TLS and a database user restricted to this app. If the cPanel PostgreSQL server is local and does not support TLS, production accepts a no-TLS URL only for `localhost`, `127.0.0.1`, or `::1`; set `sslmode=disable` explicitly. Never use this exception for a remote database. UUID defaults use built-in SQL expressions without requiring `pgcrypto`; trigger declarations use `EXECUTE PROCEDURE` for compatibility with older PostgreSQL parsers. Production still rejects non-HTTPS public URLs, missing signing/encryption secrets, and relative or application-root upload directories.

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

### First deployment: clone the repository

`deploy.sh` is part of the repository, so it cannot be used until the first clone has put the source into the application root. In cPanel Terminal:

```sh
source /home/smknwon2/nodevenv/public_html/jobenpay/22/bin/activate
APP_DIR=/home/smknwon2/public_html/jobenpay
cd "$APP_DIR"
pwd
git --version
git status
```

If `git status` says this is not a repository, check whether the application root is empty before cloning:

```sh
if [ -n "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
  echo "STOP: application root is not empty; inspect its files before cloning."
  ls -la "$APP_DIR"
else
  git clone --branch main --single-branch https://github.com/005-rgb/JOBENPAY-1.0.git "$APP_DIR"
fi
```

Only clone into an empty application root. If it contains files (including hidden files such as a cPanel-generated `.htaccess`), do not delete or overwrite them; inspect and back them up outside `public_html` first, or clone through cPanel **Git Version Control** after arranging a clean application root. If the repository is private, configure a read-only GitHub deploy key in cPanel and use its SSH clone URL; never put a personal access token in the clone URL or paste it into chat.

After a successful first clone, verify `git status` and `git remote -v`, then use cPanel's **Run NPM Install** once to install the dependencies declared by the root `package.json`. On later releases, `bash deploy.sh main` updates this existing checkout and reuses the cPanel-managed `node_modules` directory.

### Runtime dependencies managed by cPanel

Use **Run NPM Install** in cPanel's Node.js application setup to provision dependencies. The deployment script does not create a nonstandard `private` directory, replace `node_modules`, or install packages. Keep the existing directory or symlink managed by cPanel in place. Verify that Node can resolve production dependencies from the application root:

```sh
source /home/smknwon2/nodevenv/public_html/jobenpay/22/bin/activate
cd /home/smknwon2/public_html/jobenpay
node -e 'for (const name of Object.keys(require("./package.json").dependencies)) console.log(name + ": " + require.resolve(name))'
node --input-type=module -e 'await import("zod"); console.log("ESM dependency resolution OK")'
node --input-type=module -e 'import { pathToFileURL } from "node:url"; import path from "node:path"; const from = pathToFileURL(path.resolve("server/src/config.js")).href; console.log(import.meta.resolve("zod", from))'
ls -ld node_modules
```

The resolver check verifies that `zod` is visible from the server module's location without executing application configuration. Importing `server/src/config.js` directly also validates required runtime environment variables, so it can fail in a shell that does not inherit cPanel's protected values. If dependency resolution fails, confirm the activated Node environment and current directory, then use cPanel's **Run NPM Install** for this application and rerun the resolver check. For a release that changes dependencies, sync with `bash deploy.sh main`, use **Run NPM Install**, verify resolution, then restart the Node.js application as required by cPanel. Do not delete `node_modules` manually. Keep the directory inaccessible over HTTP; verify `/node_modules/` returns 403 or 404 as described above, and ask hosting support to configure the restriction if needed. Do not replace cPanel-managed `.htaccess` contents.

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

The script verifies Node 22.13+, fetches `origin/main`, warns that local tracked source edits (including staged edits and line-ending changes) will be overwritten, protects untracked server files that collide with the release, verifies the tracked frontend build and ESM production dependency resolution from the server module path before requesting a Passenger restart using `tmp/restart.txt`. It does not execute application configuration or replace/install `node_modules`. Keep `.env` and `.htaccess` untracked; the script refuses a release that tracks either file. Logs are written to `/home/smknwon2/logs/jobenpay-deploy.log`; temporary protections are stored outside the app root with private permissions. If a check fails, the script reports the retained backup path; inspect it and the log before retrying.

The script does **not** install packages, run `npm run build`, apply migrations, seed data, or alter database contents. Frontend build happens locally; its output is pushed to GitHub with the source. cPanel only runs `deploy.sh` for routine releases. If dependencies change, use cPanel's **Run NPM Install** after syncing the release.

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
