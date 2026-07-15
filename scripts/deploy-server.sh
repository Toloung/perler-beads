#!/usr/bin/env bash
set -Eeuo pipefail

release_dir="${1:-}"
remote_root="${PERLER_REMOTE_ROOT:-/opt/perler-beads}"
data_dir="${PERLER_DATA_DIR:-/data/perler}"
port="${PORT:-5000}"
app_name="${PERLER_PM2_NAME:-perler-beads}"
shared_dir="$remote_root/shared"
env_file="$shared_dir/app.env"
current_link="$remote_root/current"
previous_release=""
status_file="$release_dir/.deploy-status"

if [[ -z "$release_dir" || ! -d "$release_dir" ]]; then
  echo "Release directory is missing: $release_dir" >&2
  exit 1
fi

mkdir -p "$remote_root/releases" "$shared_dir" "$data_dir"
printf 'running\n' > "$status_file"
trap 'printf "failed\n" > "$status_file"' ERR

if [[ -L "$current_link" || -e "$current_link" ]]; then
  previous_release="$(readlink -f "$current_link" || true)"
fi

bootstrap_env_file() {
  if [[ -f "$env_file" ]]; then
    chmod 600 "$env_file"
    return
  fi

  local existing_password="${PERLER_APP_PASSWORD:-}"
  if [[ -z "$existing_password" ]] && command -v pm2 >/dev/null 2>&1; then
    existing_password="$(pm2 jlist 2>/dev/null | node -e '
      let input = "";
      process.stdin.on("data", chunk => input += chunk);
      process.stdin.on("end", () => {
        try {
          const app = JSON.parse(input).find(item => item.name === process.argv[1]);
          process.stdout.write(app?.pm2_env?.PERLER_APP_PASSWORD || "");
        } catch {}
      });
    ' "$app_name")"
  fi

  if [[ -z "$existing_password" ]]; then
    echo "Missing application password." >&2
    echo "Create $env_file with PERLER_APP_PASSWORD before the first deployment." >&2
    exit 1
  fi

  umask 077
  {
    printf 'PORT=%q\n' "$port"
    printf 'PERLER_DATA_DIR=%q\n' "$data_dir"
    printf 'PERLER_APP_PASSWORD=%q\n' "$existing_password"
  } > "$env_file"
}

load_env_file() {
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
  export PORT="${PORT:-$port}"
  export PERLER_DATA_DIR="${PERLER_DATA_DIR:-$data_dir}"
}

start_release() {
  local target="$1"
  pm2 delete "$app_name" >/dev/null 2>&1 || true
  pm2 start npm --name "$app_name" --cwd "$target" -- run start -- -p "$PORT"
}

health_check() {
  local status
  for _ in {1..30}; do
    status="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/login" || true)"
    if [[ "$status" == "200" || "$status" == "302" || "$status" == "307" ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

rollback() {
  echo "Health check failed; rolling back." >&2
  if [[ -n "$previous_release" && -d "$previous_release" ]]; then
    ln -sfn "$previous_release" "$current_link"
    start_release "$previous_release"
    pm2 save >/dev/null
  fi
}

bootstrap_env_file
load_env_file

cd "$release_dir"
npm ci --include=dev
npm run build

ln -sfn "$release_dir" "$current_link"
start_release "$release_dir"

if ! health_check; then
  rollback
  exit 1
fi

pm2 save >/dev/null

printf 'success\n' > "$status_file"
trap - ERR

find "$remote_root/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -nr \
  | awk 'NR > 5 { sub(/^[^ ]+ /, ""); print }' \
  | while IFS= read -r old_release; do
      if [[ "$old_release" != "$release_dir" && "$old_release" != "$previous_release" ]]; then
        rm -rf -- "$old_release"
      fi
    done || true

echo "Active release: $release_dir"
echo "Persistent data: $PERLER_DATA_DIR"
