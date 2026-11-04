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

ensure_cpanel_node_modules() {
  local nodeenv_dir="${CPANEL_NODEENV_DIR:-${VIRTUAL_ENV:-}}"
  if [ -z "$nodeenv_dir" ]; then
    nodeenv_dir="$ACCOUNT_HOME/nodevenv/public_html/jobenpay/22"
  fi
  local nodeenv_modules="$nodeenv_dir/lib/node_modules"

  if [ -d "$APP_DIR/node_modules" ] && [ ! -L "$APP_DIR/node_modules" ]; then
    log INFO "Mengonversi folder fisik node_modules menjadi symlink CloudLinux virtualenv..."
    mkdir -p "$nodeenv_modules"
    cp -an "$APP_DIR/node_modules/." "$nodeenv_modules/" 2>/dev/null || true
    rm -rf "$APP_DIR/node_modules"
    ln -s "$nodeenv_modules" "$APP_DIR/node_modules"
    log INFO "Symlink node_modules berhasil dihubungkan ke $nodeenv_modules."
  elif [ ! -e "$APP_DIR/node_modules" ] && [ -d "$nodeenv_modules" ]; then
    log INFO "Membuat symlink node_modules ke $nodeenv_modules..."
    ln -s "$nodeenv_modules" "$APP_DIR/node_modules"
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
  local passenger_begin='# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION BEGIN'
  local passenger_end='# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION END'
  local guard_begin='# BEGIN JOBENPAY SOURCE ACCESS GUARD'
  local guard_end='# END JOBENPAY SOURCE ACCESS GUARD'
  local routing_begin='# BEGIN JOBENPAY LITESPEED ROUTING'
  local routing_end='# END JOBENPAY LITESPEED ROUTING'
  local node_bin="$NODE_BIN"
  local preserved="$BACKUP_DIR/.htaccess.preserved"
  local generated="$BACKUP_DIR/.htaccess.generated"

  [ -f "$htaccess" ] || fail "File .htaccess tidak ditemukan di $APP_DIR. Buat Node.js App untuk domain ini di cPanel sebelum deploy."
  [ -w "$htaccess" ] || fail "File .htaccess di $APP_DIR tidak dapat ditulis oleh akun ini."

  if [ -n "${VIRTUAL_ENV:-}" ] && [ -x "$VIRTUAL_ENV/bin/node" ]; then
    node_bin="$VIRTUAL_ENV/bin/node"
  fi
  [ -x "$node_bin" ] || fail "Binary Node.js untuk Passenger tidak dapat ditentukan."

  cp -a "$htaccess" "$BACKUP_DIR/.htaccess.previous"
  if ! grep -Fqx "$passenger_begin" "$htaccess"; then
    log WARN "Blok Passenger cPanel tidak ditemukan di .htaccess; blok tersebut ditulis ulang otomatis."
  fi

  # Blok Passenger cPanel dan kedua blok JOBENPAY selalu ditulis ulang secara utuh: konfigurasi
  # lama yang salah (mis. sisa tempelan manual) tidak boleh tertinggal di atas aturan keamanan.
  awk -v pb="$passenger_begin" -v pe="$passenger_end" \
    -v gb="$guard_begin" -v ge="$guard_end" \
    -v rb="$routing_begin" -v re="$routing_end" '
    $0 == pb || $0 == gb || $0 == rb { inside = 1; next }
    inside && ($0 == pe || $0 == ge || $0 == re) { inside = 0; next }
    inside { next }
    /^[[:space:]]*Passenger[A-Za-z]+[[:space:]]/ { next }
    { print }
  ' "$htaccess" > "$preserved"

  {
    printf '%s\n\n' "$passenger_begin"
    printf 'PassengerAppRoot "%s"\n' "$APP_DIR"
    printf 'PassengerBaseURI "/"\n'
    printf 'PassengerNodejs "%s"\n' "$node_bin"
    printf 'PassengerAppType node\n'
    printf 'PassengerStartupFile app.cjs\n'
    printf '%s\n\n' "$passenger_end"
    printf '%s\n' "$guard_begin"
    cat <<'EOF'
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteRule ^(server|scripts|shared|docs|node_modules|\.git)(/|$) - [F,L,NC]
RewriteRule ^(\.env(\..*)?|package(-lock)?\.json|app\.(js|cjs)|deploy\.sh)$ - [F,L,NC]
RewriteRule ^web/(src|node_modules|package(-lock)?\.json)(/|$) - [F,L,NC]
</IfModule>
EOF
    printf '%s\n\n' "$guard_end"
    printf '%s\n' "$routing_begin"
    cat <<'EOF'
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteRule ^(api(/|$)|agent(/|$)|mcp$|healthz$|readyz$|webhooks(/|$)) - [L,NC]
RewriteRule ^$ web/dist/index.html [L]
RewriteRule ^index\.html$ web/dist/index.html [L]
RewriteRule ^assets/(.+)$ web/dist/assets/$1 [L]
RewriteRule ^(manifest\.json|favicon\.svg|favicon\.ico|favicon.*\.png|apple-touch-icon.*\.png|jobenpay.*\.png|jobenpay.*\.svg|jobenpay.*\.webp|sw\.js|robots\.txt|og-image\.svg)$ web/dist/$1 [L]
RewriteRule ^icons/(.+)$ web/dist/icons/$1 [L]
RewriteCond %{REQUEST_FILENAME} -f
RewriteRule ^ - [L]
RewriteRule ^ web/dist/index.html [L]
</IfModule>
EOF
    printf '%s\n\n' "$routing_end"
    cat "$preserved"
  } > "$generated"

  chmod --reference="$htaccess" "$generated"
  mv -- "$generated" "$htaccess"
  log INFO "Blok Passenger ($node_bin), penolakan akses source, dan routing LiteSpeed ditulis ulang di .htaccess."
}

verify_public_routes() {
  local public_url="${PUBLIC_BASE_URL:-}"
  local response_file="$BACKUP_DIR/public-healthz.response"
  local attempt status private_path

  if [ -z "$public_url" ] && [ -f "$APP_DIR/.env" ]; then
    public_url="$(grep -E '^PUBLIC_BASE_URL=' "$APP_DIR/.env" | head -n1 | cut -d= -f2- | tr -d '\r "' | tr -d "'" || true)"
  fi
  if [ -z "$public_url" ] && [ -f "$APP_DIR/.htaccess" ]; then
    public_url="$(awk '$1 == "SetEnv" && $2 == "PUBLIC_BASE_URL" { print $3; exit }' "$APP_DIR/.htaccess")"
  fi
  if [ -z "$public_url" ]; then
    log WARN "PUBLIC_BASE_URL tidak diset di .env atau .htaccess; verifikasi rute publik dilewati."
    return 0
  fi
  case "$public_url" in
    https://*|http://*) ;;
    *)
      log WARN "PUBLIC_BASE_URL ($public_url) bukan URL valid; verifikasi rute publik dilewati."
      return 0
      ;;
  esac
  public_url="${public_url%/}"
  command -v curl >/dev/null 2>&1 || {
    log WARN "curl tidak tersedia; verifikasi rute publik dilewati."
    return 0
  }

  for attempt in $(seq 1 15); do
    if curl --silent --show-error --fail --insecure --max-time 5 "$public_url/healthz" -o "$response_file" 2>/dev/null &&
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
      log WARN "Status /healthz belum merespons healthy: $(curl --silent --insecure --output /dev/null --write-out '%{http_code}' --max-time 5 "$public_url/healthz" 2>/dev/null || printf 'timeout'); restart Passenger tetap aktif."
      return 0
    fi
    sleep 2
  done

  for private_path in package.json app.js app.cjs server/src/config.js .env .git/config; do
    status="$(curl --silent --insecure --output /dev/null --write-out '%{http_code}' --max-time 5 "$public_url/$private_path" || true)"
    case "$status" in
      403|404) ;;
      *) log WARN "File source $private_path merespons status HTTP ${status:-gagal}." ;;
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
git -C "$APP_DIR" config pack.threads 1 2>/dev/null || true
git -C "$APP_DIR" config core.preloadindex false 2>/dev/null || true

if [ "$PHASE" != "--post-reset" ]; then
  if ! git -C "$APP_DIR" diff --quiet ||
    ! git -C "$APP_DIR" diff --cached --quiet; then
    log WARN "Perubahan lokal pada source terlacak, termasuk perubahan staged, akan ditimpa oleh origin/$BRANCH."
  fi

  log INFO "Mengambil branch $BRANCH dari GitHub."
  git -C "$APP_DIR" -c pack.threads=1 fetch --quiet origin "$BRANCH"
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
  # umask 077 membuat berkas hasil reset bermode 0600 sehingga web server tidak dapat membacanya (403).
  ( umask 022 && git -C "$APP_DIR" reset --hard "origin/$BRANCH" >/dev/null )

  trap - ERR
  exec bash "$APP_DIR/deploy.sh" --post-reset "$BACKUP_DIR" "$BRANCH" "$COMMIT_BEFORE" "$DEFER_RESTART"
fi

for protected in .env .htaccess; do
  if [ -e "$BACKUP_DIR/$protected" ] && [ ! -e "$APP_DIR/$protected" ]; then
    cp -a "$BACKUP_DIR/$protected" "$APP_DIR/$protected"
  fi
done

configure_passenger_routing
ensure_cpanel_node_modules
assert_release_files

# Rilis lama dapat meninggalkan berkas web/dist bermode 0600; pastikan web server dapat membacanya.
chmod -R go+rX "$APP_DIR/web/dist"

missing_deps="$(cd "$APP_DIR" && "$NODE_BIN" --input-type=module -e '
  import fs from "node:fs";
  import path from "node:path";
  import { pathToFileURL } from "node:url";
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const serverModule = pathToFileURL(path.resolve("server/src/config.js")).href;
  const missing = [];
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    try {
      await import(import.meta.resolve(name, serverModule));
    } catch {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    process.stdout.write(missing.join(" "));
  }
' 2>/dev/null || true)"

if [ -n "$missing_deps" ]; then
  log WARN "Dependensi produksi belum terpasang di node_modules: $missing_deps"
  ensure_cpanel_node_modules
  if command -v npm >/dev/null 2>&1; then
    log INFO "Menjalankan npm install --omit=dev --no-audit --no-fund untuk memasang dependensi yang kurang..."
    npm --prefix "$APP_DIR" install --omit=dev --no-audit --no-fund || fail "Gagal menginstal dependensi: $missing_deps. Silakan jalankan 'npm install --omit=dev' secara manual."
    ensure_cpanel_node_modules
  else
    fail "Dependensi ESM ($missing_deps) belum terpasang di node_modules. Jalankan 'npm install --omit=dev' pada server."
  fi
fi

resolve_error_file="$BACKUP_DIR/esm-resolve-error.log"
if ! (cd "$APP_DIR" && "$NODE_BIN" --input-type=module -e '
  import fs from "node:fs";
  import path from "node:path";
  import { pathToFileURL } from "node:url";
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const serverModule = pathToFileURL(path.resolve("server/src/config.js")).href;
  await Promise.all(Object.keys(pkg.dependencies ?? {}).map((name) => (
    import(import.meta.resolve(name, serverModule))
  )));
' >"$resolve_error_file" 2>&1); then
  err_detail="$(cat "$resolve_error_file" 2>/dev/null || true)"
  fail "Dependensi ESM tidak dapat di-resolve dari lokasi server/src/config.js. Detail: $err_detail"
fi

COMMIT_AFTER="$(git -C "$APP_DIR" rev-parse --short HEAD)"
if [ "$DEFER_RESTART" = "--defer-restart" ]; then
  log INFO "Rilis $COMMIT_AFTER ($BRANCH; sebelumnya $PREVIOUS_COMMIT) tersinkron; restart ditunda sesuai permintaan."
else
  mkdir -p "$APP_DIR/tmp"
  log INFO "Memeriksa konfigurasi runtime dan secrets..."
  if ! (cd "$APP_DIR" && "$NODE_BIN" --input-type=module -e '
    import fs from "node:fs";
    import path from "node:path";
    const envPath = path.resolve(".env");
    if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
      process.loadEnvFile(envPath);
    }
    const { assertRuntimeSecrets } = await import("./server/src/config.js");
    assertRuntimeSecrets();
  ') >"$BACKUP_DIR/runtime-check.log" 2>&1; then
    runtime_err="$(cat "$BACKUP_DIR/runtime-check.log" 2>/dev/null || true)"
    log WARN "Konfigurasi runtime mendeteksi kendala: $runtime_err"
  fi
  log INFO "Menjalankan migrasi skema database..."
  if (cd "$APP_DIR" && "$NODE_BIN" server/scripts/migrate.js >"$BACKUP_DIR/migration.log" 2>&1); then
    log INFO "Migrasi skema database berhasil diterapkan."
  else
    migration_err="$(cat "$BACKUP_DIR/migration.log" 2>/dev/null || true)"
    fail "Migrasi skema database gagal: $migration_err. Periksa DATABASE_URL di .env."
  fi

  touch "$APP_DIR/tmp/restart.txt"
  log INFO "Rilis $COMMIT_AFTER ($BRANCH; sebelumnya $PREVIOUS_COMMIT) siap; restart Passenger diminta."
  verify_public_routes
fi
log INFO "Deploy selesai. Seluruh aset, dependensi, migrasi, dan konfigurasi telah disinkronkan."

rm -rf -- "$BACKUP_DIR"
trap - ERR
