#!/bin/sh
set -eu

# Docker volumes are often root-owned on first mount. The app runs as `fluffmind`
# (see Dockerfile) and needs to git-init / write under VAULT_PATH and WORKSPACES_ROOT.
fix_volume() {
  dir="${1:-}"
  if [ -n "$dir" ]; then
    mkdir -p "$dir"
    chown -R fluffmind:nodejs "$dir"
  fi
}

fix_volume "${VAULT_PATH:-}"
fix_volume "${WORKSPACES_ROOT:-}"

if [ "${AUTH_DISABLED:-true}" != "true" ] && [ -n "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] running database migrations…"
  NODE_PATH=/app/.output/server/node_modules \
    su-exec fluffmind:nodejs node /app/run-migrations.mjs || {
    echo "[entrypoint] database migration failed" >&2
    exit 1
  }
fi

exec su-exec fluffmind:nodejs "$@"
