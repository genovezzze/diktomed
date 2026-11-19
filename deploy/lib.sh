# Shared helpers for the DiktoMed install scripts. Sourced, not run.
# Messages are in Latvian: the hospital's IT reads them.

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nKĻŪDA: %s\n' "$*" >&2; exit 1; }

need_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker nav instalēts (vajadzīgs Docker Engine 24+)."
  docker info >/dev/null 2>&1 || die "Nevar sazināties ar Docker. Palaidiet kā root vai lietotājs grupā 'docker'."
  docker compose version >/dev/null 2>&1 || die "Nav Docker Compose v2 (docker compose)."
}

# Random string of letters and digits, $1 characters long.
# (Not "tr </dev/urandom | head": with pipefail the broken pipe aborts the script.)
random_secret() {
  local s=""
  while [ ${#s} -lt "$1" ]; do
    s="$s$(head -c 64 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9')"
  done
  printf '%s' "${s:0:$1}"
}

# set_env FILE KEY VALUE: replace or append KEY=VALUE without sed escaping problems.
set_env() {
  local file=$1 key=$2
  V=$3 awk -v k="$key" '
    BEGIN { v = ENVIRON["V"] }
    index($0, k "=") == 1 { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$file" >"$file.tmp" && cat "$file.tmp" >"$file" && rm -f "$file.tmp"
}

# get_env FILE KEY: the value, without surrounding quotes.
get_env() {
  awk -v k="$2" 'index($0, k "=") == 1 { v = substr($0, length(k) + 2); gsub(/^"|"$/, "", v); print v }' "$1" | tail -n 1
}

# Wait until the web app answers its health check (up to ~5 minutes).
wait_healthy() {
  local i
  for i in $(seq 1 60); do
    if docker compose exec -T web node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      return 0
    fi
    sleep 5
  done
  docker compose ps
  docker compose logs --tail 40 migrate web
  die "Sistēma neatbild. Žurnāls ir augstāk; vairāk: docker compose logs"
}

# Files the bundle carries into the install directory (not data, not .env).
BUNDLE_FILES="docker-compose.yml docker-compose.gpu.yml docker-compose.tls.yml Caddyfile .env.example
  install.sh update.sh backup.sh restore.sh lib.sh bundle.env VERSION docs"

copy_bundle_files() {
  local src=$1 dir=$2 f
  for f in $BUNDLE_FILES; do
    [ -e "$src/$f" ] && cp -a "$src/$f" "$dir/"
  done
  return 0
}

compose_files() {
  local files="docker-compose.yml"
  [ "$1" = "true" ] && files="$files:docker-compose.gpu.yml"
  [ -n "$2" ] && files="$files:docker-compose.tls.yml"
  printf '%s' "$files"
}
