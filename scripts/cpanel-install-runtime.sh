#!/usr/bin/env bash
# Install production packages outside public_html and link them for Node ESM resolution.

set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
ACCOUNT_HOME="${HOME:-$(cd "$APP_DIR/../.." && pwd -P)}"
RUNTIME_ROOT="$ACCOUNT_HOME/private/jobenpay/node-runtime"
APP_NODE_MODULES="$APP_DIR/node_modules"
PUBLIC_ROOT="$ACCOUNT_HOME/public_html"
DEPENDENCY_IMPORT_CHECK='
  import fs from "node:fs";
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  await Promise.all(Object.keys(pkg.dependencies ?? {}).map((name) => import(name)));
'

fail() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

case "$(uname -s)" in
  Linux*) ;;
  *) fail "Installer ini hanya untuk Linux cPanel; jalankan dari Terminal cPanel." ;;
esac

command -v node >/dev/null 2>&1 || fail "Aktifkan Node.js cPanel terlebih dahulu."
command -v npm >/dev/null 2>&1 || fail "npm tidak ditemukan pada Node.js environment cPanel."
[ -s "$APP_DIR/package.json" ] || fail "package.json tidak ditemukan di $APP_DIR."
[ -s "$APP_DIR/package-lock.json" ] || fail "package-lock.json tidak ditemukan di $APP_DIR."
[ -d "$PUBLIC_ROOT" ] || fail "Web root cPanel tidak ditemukan: $PUBLIC_ROOT."
PUBLIC_ROOT="$(cd "$PUBLIC_ROOT" && pwd -P)"
[ ! -e "$APP_NODE_MODULES" ] || [ -L "$APP_NODE_MODULES" ] ||
  fail "node_modules sudah ada dan bukan symlink. Cadangkan/tinjau manual; tidak diubah."

mkdir -p "$RUNTIME_ROOT"
chmod 700 "$ACCOUNT_HOME/private/jobenpay" "$RUNTIME_ROOT"
RUNTIME_ROOT="$(cd "$RUNTIME_ROOT" && pwd -P)"
case "$RUNTIME_ROOT/" in
  "$PUBLIC_ROOT/"*) fail "Runtime dependencies harus berada di luar public_html." ;;
esac

FINGERPRINT="$(node -e '
  const crypto = require("node:crypto");
  const fs = require("node:fs");
  const hash = crypto.createHash("sha256");
  for (const file of process.argv.slice(1)) hash.update(fs.readFileSync(file));
  process.stdout.write(hash.digest("hex"));
' "$APP_DIR/package.json" "$APP_DIR/package-lock.json")"
RUNTIME_DIR="$RUNTIME_ROOT/$FINGERPRINT"
RUNTIME_NODE_MODULES="$RUNTIME_DIR/node_modules"
mkdir -p "$RUNTIME_DIR"
chmod 700 "$RUNTIME_DIR"
RUNTIME_DIR="$(cd "$RUNTIME_DIR" && pwd -P)"
RUNTIME_NODE_MODULES="$RUNTIME_DIR/node_modules"
case "$RUNTIME_DIR/" in
  "$PUBLIC_ROOT/"*) fail "Runtime dependencies harus berada di luar public_html." ;;
esac

CURRENT_TARGET=""
if [ -L "$APP_NODE_MODULES" ]; then
  CURRENT_TARGET="$(readlink -f "$APP_NODE_MODULES" 2>/dev/null || true)"
  case "$CURRENT_TARGET/" in
    "$RUNTIME_ROOT/"*) ;;
    *) fail "node_modules menunjuk ke luar direktori runtime privat; tinjau manual, tidak diubah." ;;
  esac
fi

if [ ! -d "$RUNTIME_NODE_MODULES" ] ||
  ! (cd "$RUNTIME_DIR" && node --input-type=module -e "$DEPENDENCY_IMPORT_CHECK") >/dev/null 2>&1; then
  cp "$APP_DIR/package.json" "$APP_DIR/package-lock.json" "$RUNTIME_DIR/"
  npm ci --omit=dev --prefix "$RUNTIME_DIR"
fi
[ -d "$RUNTIME_NODE_MODULES" ] || fail "npm ci tidak membuat $RUNTIME_NODE_MODULES."
(cd "$RUNTIME_DIR" && node --input-type=module -e "$DEPENDENCY_IMPORT_CHECK") ||
  fail "Verifikasi import production gagal; periksa npm ci."

if [ "$CURRENT_TARGET" != "$RUNTIME_NODE_MODULES" ]; then
  TEMP_LINK="$APP_DIR/.node_modules-link.$$"
  [ ! -e "$TEMP_LINK" ] && [ ! -L "$TEMP_LINK" ] ||
    fail "File sementara untuk symlink sudah ada: $TEMP_LINK."
  trap 'rm -f -- "${TEMP_LINK:-}"' EXIT
  ln -s "$RUNTIME_NODE_MODULES" "$TEMP_LINK"
  mv -Tf "$TEMP_LINK" "$APP_NODE_MODULES"
  trap - EXIT
fi

[ -L "$APP_NODE_MODULES" ] ||
  fail "node_modules tidak menjadi symlink POSIX. Jalankan installer dari Linux cPanel."
CURRENT_TARGET="$(readlink -f "$APP_NODE_MODULES" 2>/dev/null || true)"
[ "$CURRENT_TARGET" = "$RUNTIME_NODE_MODULES" ] ||
  fail "Symlink node_modules tidak menunjuk ke runtime privat yang baru dipasang."
(cd "$APP_DIR" && node --input-type=module -e "$DEPENDENCY_IMPORT_CHECK") ||
  fail "Import production gagal melalui symlink app root."

printf '[OK] Dependencies terpasang di luar public_html: %s\n' "$RUNTIME_NODE_MODULES"
printf '[OK] Symlink Node.js tersedia: %s -> %s\n' "$APP_NODE_MODULES" "$RUNTIME_NODE_MODULES"
printf '[WARN] Pastikan akses HTTP ke /node_modules diblokir oleh konfigurasi web server.\n'
