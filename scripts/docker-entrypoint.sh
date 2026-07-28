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

# When auth is on, migrate before the Node server starts. Postgres may still be
# booting even with Compose depends_on (container start ≠ accepting connections),
# so retry briefly instead of exiting once and looping forever under restart policies.
if [ "${AUTH_DISABLED:-true}" != "true" ] && [ -n "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] running database migrations…"
  attempt=1
  max_attempts=30
  while true; do
    if NODE_PATH=/app/.output/server/node_modules \
      su-exec fluffmind:nodejs node /app/run-migrations.mjs; then
      break
    fi
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "[entrypoint] database migration failed after ${max_attempts} attempts" >&2
      exit 1
    fi
    echo "[entrypoint] migration attempt ${attempt}/${max_attempts} failed; retrying in 2s…" >&2
    attempt=$((attempt + 1))
    sleep 2
  done
fi

exec su-exec fluffmind:nodejs "$@"
