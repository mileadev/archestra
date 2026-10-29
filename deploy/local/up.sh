#!/usr/bin/env bash
# Start a loopback-only local Archestra quickstart with a unique admin password.
# Never sources or executes .env content.
set -euo pipefail
umask 077

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
env_file="$here/.env"
if [ ! -f "$env_file" ]; then
  cp "$here/.env.example" "$env_file"
fi
chmod 600 "$env_file"

existing=""
if grep -q '^ARCHESTRA_AUTH_ADMIN_PASSWORD=' "$env_file"; then
  existing=$(grep '^ARCHESTRA_AUTH_ADMIN_PASSWORD=' "$env_file" | tail -n 1 | cut -d= -f2-)
fi
if [ -z "$existing" ]; then
  if ! command -v openssl >/dev/null 2>&1; then
    echo "ERROR: openssl is required to generate the local admin password." >&2
    exit 1
  fi
  password=$(openssl rand -hex 24)
  if grep -q '^ARCHESTRA_AUTH_ADMIN_PASSWORD=' "$env_file"; then
    # A blank key can occur after manual editing; keep the last assignment
    # authoritative and avoid rewriting unrelated provider configuration.
    printf '\nARCHESTRA_AUTH_ADMIN_PASSWORD=%s\n' "$password" >> "$env_file"
  else
    printf '\nARCHESTRA_AUTH_ADMIN_PASSWORD=%s\n' "$password" >> "$env_file"
  fi
elif [ "${#existing}" -lt 16 ]; then
  echo "ERROR: ARCHESTRA_AUTH_ADMIN_PASSWORD must have at least 16 characters." >&2
  exit 1
fi

docker compose --env-file "$env_file" -f "$here/compose.yaml" up -d
echo "Local UI: http://127.0.0.1:3000"
echo "Initial account: admin@example.com"
echo "Admin password is stored only in $env_file (mode 0600)."
echo "Use a trusted, dedicated host: quickstart mounts the Docker socket."
