#!/usr/bin/env bash
# Uji restore berkala (PRD): pulihkan file backup ke database SEMENTARA, cek
# tabel inti terisi, lalu hapus database sementara. Data produksi tidak disentuh.
# Pakai dari root repo:  deploy/test-restore.sh [file.dump]   (default: backup terbaru)
set -euo pipefail
cd "$(dirname "$0")/.."

# ENV_FILE / COMPOSE_PROJECT_NAME bisa diatur untuk stack selain default.
ENV_FILE="${ENV_FILE:-.env}"
set -a; . "$ENV_FILE"; set +a
compose() { docker compose --env-file "$ENV_FILE" "$@"; }
DB_USER="${POSTGRES_USER:-bisnismu}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
file="${1:-$(ls -1t "$BACKUP_DIR"/bisnismu-*.dump 2>/dev/null | head -1)}"
[ -n "$file" ] && [ -f "$file" ] || { echo "Tidak ada file backup untuk diuji." >&2; exit 1; }

scratch="bisnismu_restore_test"
psql() { compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$DB_USER" "$@"; }

echo "Uji restore: $file → database sementara '$scratch'"
psql -d postgres -qc "DROP DATABASE IF EXISTS $scratch" -c "CREATE DATABASE $scratch"
trap 'psql -d postgres -qc "DROP DATABASE IF EXISTS $scratch" >/dev/null' EXIT
compose exec -T postgres pg_restore --no-owner --exit-on-error -U "$DB_USER" -d "$scratch" < "$file"

echo "Jumlah baris tabel inti hasil restore:"
psql -d "$scratch" -At -F ' | ' -c "
  SELECT 'businesses', count(*) FROM businesses UNION ALL
  SELECT 'users', count(*) FROM users UNION ALL
  SELECT 'items', count(*) FROM items UNION ALL
  SELECT 'transactions', count(*) FROM transactions UNION ALL
  SELECT 'payments', count(*) FROM payments UNION ALL
  SELECT 'audit_logs', count(*) FROM audit_logs UNION ALL
  SELECT '_prisma_migrations', count(*) FROM _prisma_migrations"
echo "OK: backup bisa dipulihkan."
