#!/usr/bin/env bash
# Builds the offline installation bundle for a hospital server.
# Run on a machine with internet and Docker (Linux, macOS or WSL), from the repo.
#
#   deploy/make-bundle.sh                 # CPU worker, with the model
#   deploy/make-bundle.sh --gpu           # NVIDIA worker
#   deploy/make-bundle.sh --no-model      # an update when the model is unchanged
#   deploy/make-bundle.sh --demo          # no model, fictional demo text
#   options: --version 1.2.0  --skip-build  --out dist
set -euo pipefail
cd "$(dirname "$0")/.."
. deploy/lib.sh

GPU=false MODEL=true DEMO=false BUILD=true OUT=dist
VERSION=$(git describe --tags --always --dirty 2>/dev/null || date +%Y%m%d)
while [ $# -gt 0 ]; do
  case $1 in
    --gpu) GPU=true ;;
    --no-model) MODEL=false ;;
    --demo) DEMO=true MODEL=false ;;
    --skip-build) BUILD=false ;;
    --version) VERSION=$2; shift ;;
    --out) OUT=$2; shift ;;
    *) die "Nezināma opcija: $1" ;;
  esac
  shift
done
need_docker

SUFFIX=""
[ "$GPU" = true ] && SUFFIX="-gpu"
NAME="diktomed-$VERSION$SUFFIX"
STAGE="$OUT/$NAME"
WORKER="diktomed/worker$SUFFIX:$VERSION"
FILES=$(compose_files "$GPU" "")

if [ "$MODEL" = true ] && [ ! -f models/whisper-lv-ct2/model.bin ]; then
  die "Nav modeļa models/whisper-lv-ct2. Vispirms: worker/scripts/download_model.sh (vai --no-model / --demo)."
fi

if [ "$BUILD" = true ]; then
  say "Būvē attēlus $VERSION"
  DIKTOMED_VERSION=$VERSION COMPOSE_FILE=$FILES docker compose build migrate web worker
fi
for img in postgres:16-alpine caddy:2.8.4-alpine; do
  docker image inspect "$img" >/dev/null 2>&1 || docker pull "$img"
done

rm -rf "$STAGE" && mkdir -p "$STAGE/certs" "$STAGE/docs"
say "Saglabā attēlus"
docker save "diktomed/migrate:$VERSION" "diktomed/web:$VERSION" "$WORKER" postgres:16-alpine caddy:2.8.4-alpine | gzip -1 >"$STAGE/images.tar.gz"

cp docker-compose.yml docker-compose.gpu.yml docker-compose.tls.yml Caddyfile .env.example "$STAGE/"
cp deploy/install.sh deploy/update.sh deploy/backup.sh deploy/restore.sh deploy/lib.sh "$STAGE/"
cp docs/IT-uzstadisana.md docs/IT-apraksts.md "$STAGE/docs/"
printf '%s\n' "$VERSION" >"$STAGE/VERSION"
cat >"$STAGE/bundle.env" <<EOT
DIKTOMED_VERSION=$VERSION
BUNDLE_GPU=$GPU
BUNDLE_DEMO=$DEMO
EOT
echo "Ielieciet šeit cert.pem (ar ķēdi) un key.pem, ja HTTPS jāieslēdz uzstādīšanas laikā." >"$STAGE/certs/README.txt"
if [ "$MODEL" = true ]; then
  say "Kopē modeli"
  mkdir -p "$STAGE/models" && cp -a models/whisper-lv-ct2 "$STAGE/models/"
fi

(cd "$STAGE" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum >SHA256SUMS)
say "Arhīvs"
tar -C "$OUT" -cf "$OUT/$NAME.tar" "$NAME"
rm -rf "$STAGE"
ls -lh "$OUT/$NAME.tar"
echo "Slimnīcas serverī: tar -xf $NAME.tar && cd $NAME && sudo ./install.sh"
