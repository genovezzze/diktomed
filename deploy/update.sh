#!/usr/bin/env bash
# Installs a new DiktoMed version from a new bundle. Data and users stay.
#   sudo ./update.sh [/opt/diktomed]
# Makes a backup first. Roll back: set DIKTOMED_VERSION in .env to the old
# version and run "docker compose up -d --no-build" (the schema only grows,
# so the old version still works with the new database).
set -euo pipefail
SRC=$(cd "$(dirname "$0")" && pwd)
. "$SRC/lib.sh"
DIR=${1:-/opt/diktomed}

need_docker
[ -f "$SRC/images.tar.gz" ] || die "Palaidiet update.sh no jaunās pakotnes mapes."
[ -f "$DIR/.env" ] || die "Mapē $DIR DiktoMed nav uzstādīts (izmantojiet install.sh)."
. "$SRC/bundle.env"
ENV="$DIR/.env"
OLD=$(get_env "$ENV" DIKTOMED_VERSION)
[ "$BUNDLE_GPU" = true ] && ! docker info 2>/dev/null | grep -qi nvidia && die "GPU pakotne, bet Docker neredz NVIDIA."
if [ -f "$SRC/SHA256SUMS" ]; then
  (cd "$SRC" && sha256sum --quiet -c SHA256SUMS) || die "Pakotne ir bojāta (kontrolsummas nesakrīt)."
fi

say "Atjaunina $OLD -> $DIKTOMED_VERSION"
say "Rezerves kopija pirms atjaunināšanas"
"$DIR/backup.sh"

say "Ielādē jaunos attēlus"
docker load -i "$SRC/images.tar.gz"
copy_bundle_files "$SRC" "$DIR"
if [ -d "$SRC/models/whisper-lv-ct2" ]; then
  say "Atjaunina modeli"
  rm -rf "$DIR/models/whisper-lv-ct2.new"
  cp -a "$SRC/models/whisper-lv-ct2" "$DIR/models/whisper-lv-ct2.new"
  rm -rf "$DIR/models/whisper-lv-ct2.old"
  [ -d "$DIR/models/whisper-lv-ct2" ] && mv "$DIR/models/whisper-lv-ct2" "$DIR/models/whisper-lv-ct2.old"
  mv "$DIR/models/whisper-lv-ct2.new" "$DIR/models/whisper-lv-ct2"
fi

TLS=$(get_env "$ENV" DIKTOMED_HOST)
set_env "$ENV" COMPOSE_FILE "$(compose_files "$BUNDLE_GPU" "$TLS")"
set_env "$ENV" DIKTOMED_VERSION "$DIKTOMED_VERSION"

say "Restartē"
cd "$DIR"
docker compose up -d --no-build --remove-orphans
wait_healthy
echo
echo "Gatavs: DiktoMed $DIKTOMED_VERSION. Atpakaļ uz $OLD: .env -> DIKTOMED_VERSION=$OLD, tad docker compose up -d --no-build"
