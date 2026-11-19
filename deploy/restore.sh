#!/usr/bin/env bash
# Restores a backup made by backup.sh. Replaces ALL current data.
#   ./restore.sh backups/db-20261120-023000.dump [backups/audio-20261120-023000.tar.gz]
set -euo pipefail
DIR=$(cd "$(dirname "$0")" && pwd)
. "$DIR/lib.sh"
DB=${1:-}
AUDIO=${2:-}
[ -f "$DB" ] || die "Norādiet datubāzes kopiju: ./restore.sh backups/db-....dump [backups/audio-....tar.gz]"
[ -z "$AUDIO" ] || [ -f "$AUDIO" ] || die "Nav faila $AUDIO"
DB=$(cd "$(dirname "$DB")" && pwd)/$(basename "$DB")
[ -z "$AUDIO" ] || AUDIO=$(cd "$(dirname "$AUDIO")" && pwd)/$(basename "$AUDIO")
cd "$DIR"

echo "Tiks aizstāti VISI pašreizējie dati ar: $DB ${AUDIO:+un $AUDIO}"
if [ "${DIKTOMED_RESTORE_YES:-}" != "ja" ]; then
  read -r -p "Ierakstiet 'ja', lai turpinātu: " ans
  [ "$ans" = "ja" ] || die "Atcelts."
fi

say "Aptur web un worker"
docker compose stop web worker
docker compose up -d --no-build db
say "Atjauno datubāzi"
docker compose exec -T db pg_restore -U diktomed -d diktomed --clean --if-exists --no-owner --single-transaction <"$DB"
if [ -n "$AUDIO" ]; then
  say "Atjauno audio"
  docker compose run --rm --no-deps -T --entrypoint sh web -c 'find /data -mindepth 1 -delete && tar -C /data -xzf -' <"$AUDIO"
fi
say "Palaiž"
docker compose up -d --no-build
wait_healthy
echo "Atjaunots."
