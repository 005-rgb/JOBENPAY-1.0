#!/usr/bin/env bash
# Pull a locally-built JOBENPAY release from GitHub and request a Passenger restart.
# This script does not install dependencies, build assets, migrate, or seed.

set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ACCOUNT_HOME="${HOME:-$(cd "$APP_DIR/../.." && pwd -P)}"
LOG_DIR="$ACCOUNT_HOME/logs"
LOG_FILE="$LOG_DIR/jobenpay-deploy.log"
BACKUP_ROOT="$ACCOUNT_HOME/.jobenpay-deploy-protect"
PHASE="${1:-}"

umask 077
mkdir -p "$LOG_DIR"

log() {
  local level="$1"
  shift
  printf '[%s] [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$level" "$*" |
    tee -a "$LOG_FILE"
}

fail() {
  log ERROR "$*"
  exit 1
}

restore_untracked_conflicts() {
  local backup_dir="$1"
  local restore_list="$backup_dir/restore-files.list"
  [ -d "$backup_dir/untracked" ] || return 0
  find "$backup_dir/untracked" -type f -print0 > "$restore_list"
  while IFS= read -r -d '' backup_file; do
    local relative_path="${backup_file#"$backup_dir/untracked/"}"
    local destination="$APP_DIR/$relative_path"
    if [ ! -e "$destination" ]; then
      mkdir -p "$(dirname "$destination")"
      mv "$backup_file" "$destination"
    fi
  done < "$restore_list"
  log WARN "File lokal yang berbenturan dengan rilis dipulihkan dari cadangan."
}

on_error() {
  local status="$?"
  local line="$1"
  trap - ERR
  log ERROR "Deploy gagal pada baris $line (status $status)."
  if [ "$PHASE" != "--post-reset" ] && [ -n "${BACKUP_DIR:-}" ]; then
    restore_untracked_conflicts "$BACKUP_DIR"
  fi
  log ERROR "Cadangan privat: ${BACKUP_DIR:-tidak tersedia}"
  log ERROR "Periksa log privat: $LOG_FILE"
  exit "$status"
}
trap 'on_error "$LINENO"' ERR

activate_cpanel_node() {
  local nodeenv_dir="${CPANEL_NODEENV_DIR:-${VIRTUAL_ENV:-}}"
  if [ -z "$nodeenv_dir" ]; then
    nodeenv_dir="$ACCOUNT_HOME/nodevenv/public_html/jobenpay/22"
  fi

  if [ -f "$nodeenv_dir/bin/activate" ]; then
    local nounset_was_enabled=0 activation_status=0
    case "$-" in
      *u*) nounset_was_enabled=1; set +u ;;
    esac
    # shellcheck disable=SC1090
    . "$nodeenv_dir/bin/activate" || activation_status=$?
    if [ "$nounset_was_enabled" -eq 1 ]; then
      set -u
    fi
    [ "$activation_status" -eq 0 ] || fail "Gagal mengaktifkan environment Node.js cPanel."
  else
    fail "Environment Node.js cPanel tidak ditemukan: $nodeenv_dir"
  fi
}

assert_release_files() {
  local release_file
  for release_file in \
    app.js \
    app.cjs \
    deploy.sh \
    package.json \
    package-lock.json \
    server/src/server.js \
    web/dist/index.html; do
    [ -s "$APP_DIR/$release_file" ] ||
      fail "File rilis tidak ada: $release_file. Build lokal, commit, lalu push ke GitHub."
    git -C "$APP_DIR" ls-files --error-unmatch "$release_file" >/dev/null 2>&1 ||
      fail "File rilis belum terlacak di Git: $release_file."
  done

  "$NODE_BIN" --input-type=module -e '
    import fs from "node:fs";
    import path from "node:path";
    const root = process.cwd();
    const html = fs.readFileSync(path.join(root, "web/dist/index.html"), "utf8");
    const assets = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)]
      .map((match) => decodeURIComponent(match[1].replace(/^\//, "")));
    if (assets.length === 0) throw new Error("index.html does not reference built assets");
    for (const asset of assets) {
      if (!fs.statSync(path.join(root, "web/dist", asset.replace(/^web\/dist\//, ""))).isFile()) {
        throw new Error(`built asset is missing: ${asset}`);
      }
    }
  ' || fail "Artefak frontend tidak lengkap; build lokal dan push direktori web/dist."
}

configure_passenger_routing() {
  local htaccess="$APP_DIR/.htaccess"
  local passenger_end='# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION END'

  [ -f "$htaccess" ] || fail "File .htaccess cPanel tidak ditemukan. Buat/aplikasikan Node.js App untuk domain ini di cPanel sebelum deploy."
  grep -Fq "PassengerAppRoot \"$APP_DIR\"" "$htaccess" ||
    fail ".htaccess PassengerAppRoot tidak menunjuk ke $APP_DIR. Perbaiki Application Root di Setup Node.js App."
  grep -Eq '^[[:space:]]*PassengerBaseURI[[:space:]]+"/"[[:space:]]*$' "$htaccess" ||
    fail ".htaccess harus memiliki PassengerBaseURI \"/\" untuk domain root nh.jobenapp.cloud."
  grep -Eq '^[[:space:]]*PassengerStartupFile[[:space:]]+app\.js[[:space:]]*$' "$htaccess" ||
    fail ".htaccess harus memiliki PassengerStartupFile app.js."
  grep -Fq "$passenger_end" "$htaccess" ||
    fail ".htaccess tidak memiliki penanda akhir konfigurasi Passenger cPanel; perbaiki pemetaan aplikasi di cPanel."

  if ! grep -Eiq '^[[:space:]]*PassengerEnabled[[:space:]]+On([[:space:]]|$)' "$htaccess"; then
    local updated_htaccess="$BACKUP_DIR/.htaccess.passenger"
    awk -v marker="$passenger_end" '
      $0 == marker {
        print "PassengerEnabled On"
        inserted = 1
      }
      { print }
      END { if (!inserted) exit 1 }
    ' "$htaccess" > "$updated_htaccess" ||
      fail "Tidak dapat menambahkan PassengerEnabled On ke konfigurasi cPanel."
    chmod --reference="$htaccess" "$updated_htaccess"
    mv -- "$updated_htaccess" "$htaccess"
    log WARN "PassengerEnabled On diaktifkan di blok konfigurasi cPanel."
  fi

  if ! grep -Fq '# BEGIN JOBENPAY SOURCE ACCESS GUARD' "$htaccess"; then
    cat >> "$htaccess" <<'EOF'

# BEGIN JOBENPAY SOURCE ACCESS GUARD
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteRule ^(server|scripts|shared|docs|node_modules|\.git)(/|$) - [F,L,NC]
RewriteRule ^(\.env(\..*)?|package(-lock)?\.json|app\.(js|cjs)|deploy\.sh)$ - [F,L,NC]
RewriteRule ^web/(src|node_modules|package(-lock)?\.json)(/|$) - [F,L,NC]
</IfModule>
# END JOBENPAY SOURCE ACCESS GUARD
EOF
    log INFO "Aturan penolakan akses source ditambahkan ke .htaccess."
  fi
}

verify_public_routes() {
  local public_url="${PUBLIC_BASE_URL:-}"
  local response_file="$BACKUP_DIR/public-healthz.response"
  local attempt status private_path

  if [ -z "$public_url" ] && [ -f "$APP_DIR/.htaccess" ]; then
    public_url="$(awk '$1 == "SetEnv" && $2 == "PUBLIC_BASE_URL" { print $3; exit }' "$APP_DIR/.htaccess")"
  fi
  case "$public_url" in
    https://*) ;;
    *) fail "Tidak dapat memverifikasi domain: set PUBLIC_BASE_URL=https://... di environment cPanel atau .htaccess." ;;
  esac
  public_url="${public_url%/}"
  command -v curl >/dev/null 2>&1 || fail "curl dibutuhkan untuk memverifikasi routing domain setelah Passenger restart."

  for attempt in $(seq 1 15); do
    if curl --silent --show-error --fail --max-time 5 "$public_url/healthz" -o "$response_file" 2>/dev/null &&
      "$NODE_BIN" -e '
        const fs = require("node:fs");
        try {
          const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
          process.exit(body.service === "jobenpay" && body.status === "healthy" ? 0 : 1);
        } catch {
          process.exit(1);
        }
      ' "$response_file" >/dev/null 2>&1; then
      break
    fi
    if [ "$attempt" -eq 15 ]; then
      fail "Domain $public_url masih tidak menuju aplikasi JOBENPAY (/healthz bukan JSON healthy). Periksa PassengerEnabled, Application URL/root, dan log Passenger; respons placeholder LiteSpeed bukan health check valid."
    fi
    sleep 2
  done

  for private_path in package.json app.js app.cjs server/src/config.js .env .git/config; do
    status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 "$public_url/$private_path" || true)"
    case "$status" in
      403|404) ;;
      *) fail "File source $private_path masih dapat diakses melalui $public_url (HTTP ${status:-request gagal}); jangan gunakan aplikasi sampai source tertutup." ;;
    esac
  done
  log INFO "Routing Passenger dan perlindungan source terverifikasi di $public_url."
}

activate_cpanel_node
NODE_BIN="$(command -v node 2>/dev/null || true)"
[ -n "$NODE_BIN" ] || fail "Node.js tidak ditemukan; aktifkan aplikasi Node.js di cPanel."
NODE_VERSION="$("$NODE_BIN" -p 'process.versions.node' 2>/dev/null || true)"
NODE_MAJOR="${NODE_VERSION%%.*}"
NODE_MINOR="$(printf '%s' "$NODE_VERSION" | cut -d. -f2)"
[ "$NODE_MAJOR" = "22" ] && [ "${NODE_MINOR:-0}" -ge 13 ] ||
  fail "Proyek memerlukan Node.js 22.13 atau lebih baru pada major 22; terdeteksi ${NODE_VERSION:-tidak diketahui}."

if [ "$PHASE" = "--post-reset" ]; then
  BACKUP_DIR="${2:-}"
  BRANCH="${3:-}"
  PREVIOUS_COMMIT="${4:-unknown}"
  DEFER_RESTART="${5:-}"
  case "$BACKUP_DIR" in
    "$BACKUP_ROOT".*) ;;
    *) fail "Lokasi cadangan deploy tidak valid." ;;
  esac
  [ -d "$BACKUP_DIR" ] && [ ! -L "$BACKUP_DIR" ] &&
    [ -f "$BACKUP_DIR/.jobenpay-deploy-backup" ] ||
    fail "Cadangan deploy privat tidak ditemukan atau tidak valid."
else
  [ "$#" -le 2 ] || fail "Penggunaan: bash deploy.sh [branch] [--defer-restart]"
  BRANCH="${1:-main}"
  DEFER_RESTART="${2:-}"
fi
[ -z "$DEFER_RESTART" ] || [ "$DEFER_RESTART" = "--defer-restart" ] ||
  fail "Opsi tidak dikenal: $DEFER_RESTART"

git -C "$APP_DIR" rev-parse --git-dir >/dev/null 2>&1 || fail "Folder aplikasi bukan repository Git."
git -C "$APP_DIR" remote get-url origin >/dev/null 2>&1 || fail "Remote Git bernama origin belum disiapkan."
git check-ref-format --branch "$BRANCH" >/dev/null 2>&1 || fail "Nama branch tidak valid."

if [ "$PHASE" != "--post-reset" ]; then
  if ! git -C "$APP_DIR" diff --quiet ||
    ! git -C "$APP_DIR" diff --cached --quiet; then
    log WARN "Perubahan lokal pada source terlacak, termasuk perubahan staged, akan ditimpa oleh origin/$BRANCH."
  fi

  log INFO "Mengambil branch $BRANCH dari GitHub."
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" show-ref --verify --quiet "refs/remotes/origin/$BRANCH" ||
    fail "Branch origin/$BRANCH tidak ditemukan."

  for protected in .env .htaccess; do
    if git -C "$APP_DIR" cat-file -e "origin/$BRANCH:$protected" 2>/dev/null; then
      fail "$protected terlacak di GitHub; deploy dibatalkan agar konfigurasi server tidak tertimpa."
    fi
  done

  BACKUP_DIR="$(mktemp -d "$BACKUP_ROOT.XXXXXX")"
  chmod 700 "$BACKUP_DIR"
  : > "$BACKUP_DIR/.jobenpay-deploy-backup"
  for protected in .env .htaccess; do
    if [ -e "$APP_DIR/$protected" ]; then
      cp -a "$APP_DIR/$protected" "$BACKUP_DIR/$protected"
    fi
  done

  RELEASE_FILES="$BACKUP_DIR/release-files.list"
  git -C "$APP_DIR" ls-tree -r --name-only -z "origin/$BRANCH" > "$RELEASE_FILES"
  while IFS= read -r -d '' tracked_path; do
    case "$tracked_path" in
      .env|.htaccess) continue ;;
    esac
    local_path="$APP_DIR/$tracked_path"
    if [ -e "$local_path" ] &&
      ! git -C "$APP_DIR" ls-files --error-unmatch "$tracked_path" >/dev/null 2>&1; then
      [ ! -d "$local_path" ] ||
        fail "Bentrok direktori lokal dengan file rilis: $tracked_path."
      mkdir -p "$BACKUP_DIR/untracked/$(dirname "$tracked_path")"
      mv "$local_path" "$BACKUP_DIR/untracked/$tracked_path"
    fi
  done < "$RELEASE_FILES"

  COMMIT_BEFORE="$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || printf 'none')"
  log INFO "Memperbarui source dan build lokal ke origin/$BRANCH."
  git -C "$APP_DIR" reset --hard "origin/$BRANCH" >/dev/null

  trap - ERR
  exec bash "$APP_DIR/deploy.sh" --post-reset "$BACKUP_DIR" "$BRANCH" "$COMMIT_BEFORE" "$DEFER_RESTART"
fi

for protected in .env .htaccess; do
  if [ -e "$BACKUP_DIR/$protected" ] && [ ! -e "$APP_DIR/$protected" ]; then
    cp -a "$BACKUP_DIR/$protected" "$APP_DIR/$protected"
  fi
done

configure_passenger_routing
assert_release_files

if ! (cd "$APP_DIR" && "$NODE_BIN" --input-type=module -e '
  import fs from "node:fs";
  import path from "node:path";
  import { pathToFileURL } from "node:url";
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const serverModule = pathToFileURL(path.resolve("server/src/config.js")).href;
  await Promise.all(Object.keys(pkg.dependencies ?? {}).map((name) => (
    import(import.meta.resolve(name, serverModule))
  )));
') >/dev/null 2>&1; then
  fail "Dependensi ESM tidak dapat di-resolve dari lokasi server/src/config.js. Periksa package.json dan node_modules aplikasi, lalu ulangi deploy."
fi

COMMIT_AFTER="$(git -C "$APP_DIR" rev-parse --short HEAD)"
if [ "$DEFER_RESTART" = "--defer-restart" ]; then
  log INFO "Rilis $COMMIT_AFTER ($BRANCH; sebelumnya $PREVIOUS_COMMIT) tersinkron; restart ditunda sesuai permintaan."
else
  mkdir -p "$APP_DIR/tmp"
  touch "$APP_DIR/tmp/restart.txt"
  log INFO "Rilis $COMMIT_AFTER ($BRANCH; sebelumnya $PREVIOUS_COMMIT) siap; restart Passenger diminta."
  verify_public_routes
fi
log INFO "Tidak ada build, instalasi paket, migrasi database, atau seed yang dijalankan oleh deploy.sh."

rm -rf -- "$BACKUP_DIR"
trap - ERR
