#!/usr/bin/env bash
# Backup of the database and the audio files while DiktoMed runs.
#   ./backup.sh                      # into ./backups, keeps 14 days
#   BACKUP_DIR=/mnt/nas/diktomed BACKUP_KEEP_DAYS=30 ./backup.sh
# The files hold patient data: keep them on encrypted storage only.
set -euo pipefail
DIR=$(cd "$(dirname "$0")" && pwd)
. "$DIR/lib.sh"
cd "$DIR"
OUT=${BACKUP_DIR:-$DIR/backups}
KEEP=${BACKUP_KEEP_DAYS:-14}
STAMP=$(date +%Y%m%d-%H%M%S)
umask 077
mkdir -p "$OUT"

echo "$(date '+%F %T') rezerves kopija $STAMP"
docker compose exec -T db pg_dump -U diktomed -d diktomed -Fc >"$OUT/db-$STAMP.dump.part"
mv "$OUT/db-$STAMP.dump.part" "$OUT/db-$STAMP.dump"
docker compose exec -T web tar -C /data -czf - . >"$OUT/audio-$STAMP.tar.gz.part"
mv "$OUT/audio-$STAMP.tar.gz.part" "$OUT/audio-$STAMP.tar.gz"

find "$OUT" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'audio-*.tar.gz' \) -mtime "+$KEEP" -delete
find "$OUT" -maxdepth 1 -type f -name '*.part' -mmin +600 -delete
ls -lh "$OUT/db-$STAMP.dump" "$OUT/audio-$STAMP.tar.gz"
