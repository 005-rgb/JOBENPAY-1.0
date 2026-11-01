#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be configured}"
: "${BACKUP_DIR:?BACKUP_DIR must point outside the public web root}"

mkdir -p "$BACKUP_DIR"
backup_dir="$(cd "$BACKUP_DIR" && pwd)"
case "$backup_dir" in
  */public_html|*/public_html/*|*/www|*/www/*)
    echo "BACKUP_DIR must be outside public_html/www." >&2
    exit 1
    ;;
esac

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="$backup_dir/jobenpay-${stamp}.dump"
pg_dump --format=custom --no-owner --file="$output" "$DATABASE_URL"
find "$backup_dir" -maxdepth 1 -type f -name 'jobenpay-*.dump' -mtime +6 -delete
printf 'Database backup created: %s\n' "$output"
