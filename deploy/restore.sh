#!/usr/bin/env bash
# Pulihkan database produksi dari file backup (.dump). MENIMPA data sekarang.
# Pakai dari root repo:  deploy/restore.sh backups/bisnismu-20261022-020000.dump
set -euo pipefail
cd "$(dirname "$0")/.."

file="${1:?Pakai: deploy/restore.sh <file.dump>}"
[ -f "$file" ] || { echo "File tidak ditemukan: $file" >&2; exit 1; }
# ENV_FILE / COMPOSE_PROJECT_NAME bisa diatur untuk stack selain default.
ENV_FILE="${ENV_FILE:-.env}"
set -a; . "$ENV_FILE"; set +a
compose() { docker compose --env-file "$ENV_FILE" "$@"; }
DB_USER="${POSTGRES_USER:-bisnismu}"
DB_NAME="${POSTGRES_DB:-bisnismu}"

echo "PERINGATAN: database '$DB_NAME' akan DITIMPA dengan isi $file."
read -r -p "Ketik PULIHKAN untuk melanjutkan: " answer
[ "$answer" = "PULIHKAN" ] || { echo "Dibatalkan."; exit 1; }

# API dihentikan supaya tidak ada transaksi baru selama pemulihan.
compose stop api
compose exec -T postgres pg_restore --clean --if-exists --no-owner \
  -U "$DB_USER" -d "$DB_NAME" < "$file"
compose start api
echo "Selesai: '$DB_NAME' dipulihkan dari $file."
