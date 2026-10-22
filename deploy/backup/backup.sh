#!/bin/sh
# Backup harian PostgreSQL BisnisMu (dijalankan layanan `backup` di compose).
#   - terjadwal: setiap hari pukul $BACKUP_TIME (zona waktu $TZ)
#   - manual:    docker compose run --rm backup now
# File: $BACKUP_DIR/bisnismu-YYYYmmdd-HHMMSS.dump (format custom pg_dump),
# file lebih tua dari $BACKUP_RETENTION_DAYS hari dihapus.
set -eu

BACKUP_DIR=/backups
BACKUP_TIME="${BACKUP_TIME:-02:00}"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"

run_backup() {
  stamp=$(date +%Y%m%d-%H%M%S)
  file="$BACKUP_DIR/bisnismu-$stamp.dump"
  # Tulis ke .partial dulu: file .dump selalu lengkap, tidak pernah setengah jadi.
  pg_dump --format=custom --file="$file.partial"
  mv "$file.partial" "$file"
  echo "[backup] $(date '+%F %T') selesai: $file ($(du -h "$file" | cut -f1))"
  find "$BACKUP_DIR" -name 'bisnismu-*.dump' -mtime +"$RETENTION" -print -delete | sed 's/^/[backup] dihapus (lewat retensi): /'
}

if [ "${1:-}" = "now" ]; then
  run_backup
  exit 0
fi

echo "[backup] terjadwal setiap hari pukul $BACKUP_TIME (${TZ:-UTC}), retensi $RETENTION hari"
while true; do
  now=$(date +%s)
  target=$(date -d "$(date +%F) $BACKUP_TIME" +%s)
  [ "$target" -le "$now" ] && target=$((target + 86400))
  sleep $((target - now))
  run_backup || echo "[backup] $(date '+%F %T') GAGAL — dicoba lagi besok" >&2
done
