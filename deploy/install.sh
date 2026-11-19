#!/usr/bin/env bash
# First installation of DiktoMed from the offline bundle.
#   sudo ./install.sh [/opt/diktomed]
# Answers can be given in advance (for scripted installs):
#   DIKTOMED_ORG, DIKTOMED_ADMIN_EMAIL, DIKTOMED_HOST (empty = no HTTPS yet)
set -euo pipefail
SRC=$(cd "$(dirname "$0")" && pwd)
. "$SRC/lib.sh"
DIR=${1:-/opt/diktomed}

need_docker
[ -f "$SRC/images.tar.gz" ] || die "Palaidiet install.sh no izpakotās pakotnes mapes."
[ -f "$DIR/.env" ] && die "DiktoMed jau ir uzstādīts mapē $DIR. Jaunai versijai izmantojiet update.sh."
. "$SRC/bundle.env"

if [ "$BUNDLE_DEMO" != true ] && [ ! -f "$SRC/models/whisper-lv-ct2/model.bin" ]; then
  die "Pakotnē nav runas atpazīšanas modeļa (models/whisper-lv-ct2)."
fi
if [ "$BUNDLE_GPU" = true ] && ! docker info 2>/dev/null | grep -qi nvidia; then
  die "Šī pakotne ir GPU versijai, bet Docker neredz NVIDIA (vajadzīgs NVIDIA Container Toolkit)."
fi

if [ -f "$SRC/SHA256SUMS" ]; then
  say "Pārbauda pakotnes kontrolsummas"
  (cd "$SRC" && sha256sum --quiet -c SHA256SUMS) || die "Pakotne ir bojāta (kontrolsummas nesakrīt)."
fi

ask() { # ask VAR "Question" default
  local var=$1 q=$2 def=$3 ans
  if [ -n "${!var+x}" ]; then return; fi
  if [ -t 0 ]; then read -r -p "$q [$def]: " ans; else ans=""; fi
  printf -v "$var" '%s' "${ans:-$def}"
}
say "Iestatījumi"
ask DIKTOMED_ORG "Slimnīcas nosaukums" "Slimnīca"
ask DIKTOMED_ADMIN_EMAIL "Pirmā administratora e-pasts" "admin@slimnica.lv"
ask DIKTOMED_HOST "Servera adrese HTTPS sertifikātam, piem. diktomed.slimnica.lv (tukšs = bez HTTPS)" ""

TLS=""
if [ -n "$DIKTOMED_HOST" ]; then
  mkdir -p "$DIR/certs"
  for f in cert.pem key.pem; do
    [ -f "$DIR/certs/$f" ] || { [ -f "$SRC/certs/$f" ] && cp "$SRC/certs/$f" "$DIR/certs/"; } || true
    [ -f "$DIR/certs/$f" ] || die "Nav sertifikāta $f. Ielieciet cert.pem un key.pem mapē $SRC/certs vai $DIR/certs."
  done
  chmod 600 "$DIR/certs/key.pem"
  TLS=$DIKTOMED_HOST
fi

say "Kopē failus uz $DIR"
mkdir -p "$DIR/backups" "$DIR/certs"
chmod 700 "$DIR/backups"
copy_bundle_files "$SRC" "$DIR"
if [ -d "$SRC/models" ]; then cp -a "$SRC/models" "$DIR/"; else mkdir -p "$DIR/models"; fi

say "Ielādē Docker attēlus (dažas minūtes)"
docker load -i "$SRC/images.tar.gz"

say "Sagatavo .env ar nejaušām parolēm"
ADMIN_PASSWORD=$(random_secret 16)
ENV="$DIR/.env"
(umask 077 && cp "$SRC/.env.example" "$ENV")
set_env "$ENV" COMPOSE_FILE "$(compose_files "$BUNDLE_GPU" "$TLS")"
set_env "$ENV" DIKTOMED_VERSION "$DIKTOMED_VERSION"
set_env "$ENV" POSTGRES_PASSWORD "$(random_secret 40)"
set_env "$ENV" SESSION_SECRET "$(random_secret 64)"
set_env "$ENV" SEED_ADMIN_EMAIL "$DIKTOMED_ADMIN_EMAIL"
set_env "$ENV" SEED_ADMIN_PASSWORD "$ADMIN_PASSWORD"
set_env "$ENV" ORG_NAME "\"${DIKTOMED_ORG//\"/}\""
if [ -n "$TLS" ]; then
  set_env "$ENV" DIKTOMED_HOST "$TLS"
  set_env "$ENV" COOKIE_SECURE true
  set_env "$ENV" TRUST_PROXY true
fi
if [ "$BUNDLE_DEMO" = true ]; then
  set_env "$ENV" ASR_BACKEND fake
  set_env "$ENV" DEMO_MODE true
fi
chmod 600 "$ENV"

say "Palaiž DiktoMed"
cd "$DIR"
docker compose up -d --no-build
wait_healthy

if [ -d /etc/cron.d ] && [ -w /etc/cron.d ]; then
  echo "30 2 * * * root $DIR/backup.sh >>$DIR/backups/backup.log 2>&1" >/etc/cron.d/diktomed-backup
  BACKUP_NOTE="katru nakti 02:30 uz $DIR/backups (/etc/cron.d/diktomed-backup)"
else
  BACKUP_NOTE="NAV ieslēgtas: pievienojiet $DIR/backup.sh plānotājam (cron)"
fi

URL=${TLS:+https://$TLS}
cat <<EOT

==============================================================
 DiktoMed $DIKTOMED_VERSION ir uzstādīts mapē $DIR
 Adrese:        ${URL:-http://127.0.0.1:3000 (tikai šajā serverī, HTTPS vēl nav)}
 Administrators: $DIKTOMED_ADMIN_EMAIL
 Pagaidu parole: $ADMIN_PASSWORD
   (pirmajā pieslēgšanās reizē jānomaina; nododiet to drošā veidā)
 Rezerves kopijas: $BACKUP_NOTE
==============================================================
EOT
[ "$BUNDLE_DEMO" = true ] && echo "UZMANĪBU: demo pakotne. Teksts ir izdomāts, nav paredzēta pacientu datiem."
exit 0
