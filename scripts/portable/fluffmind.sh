#!/usr/bin/env bash
# Fluffmind portable launcher (unix). Packaged under bin/fluffmind.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$ROOT/runtime/node/bin/node"
SERVER_ENTRY="$ROOT/app/.output/server/index.mjs"
DEFAULT_VAULT="$ROOT/vault"
DATA_DIR="$ROOT/data"

VAULT=""
PORT="${PORT:-3000}"
HOST="${HOST:-127.0.0.1}"
OPEN_BROWSER=1

usage() {
  cat <<'EOF'
Fluffmind portable (solo mode — no Docker, no Postgres)

Usage:
  fluffmind [--vault <path>] [--port <n>] [--host <addr>] [--no-open] [--help]

Vault resolution (first match wins):
  1. --vault <path>
  2. VAULT_PATH environment variable
  3. <package>/vault

Requires: git on PATH
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault)
      VAULT="${2:-}"
      shift 2
      ;;
    --port)
      PORT="${2:-}"
      shift 2
      ;;
    --host)
      HOST="${2:-}"
      shift 2
      ;;
    --no-open)
      OPEN_BROWSER=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$VAULT" ]]; then
  if [[ -n "${VAULT_PATH:-}" ]]; then
    VAULT="$VAULT_PATH"
  else
    VAULT="$DEFAULT_VAULT"
  fi
fi

mkdir -p "$VAULT" "$DATA_DIR"

# Resolve to absolute path
if command -v realpath >/dev/null 2>&1; then
  VAULT="$(realpath "$VAULT")"
else
  VAULT="$(cd "$VAULT" && pwd)"
fi

if [[ ! -x "$NODE_BIN" ]]; then
  echo "error: embedded Node runtime not found at $NODE_BIN" >&2
  exit 1
fi

if [[ ! -f "$SERVER_ENTRY" ]]; then
  echo "error: Nitro server entry not found at $SERVER_ENTRY" >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "error: git is required on PATH (install Git, then retry)." >&2
  echo "  macOS: xcode-select --install  or  brew install git" >&2
  echo "  Linux: apt/dnf/pacman install git" >&2
  exit 1
fi

if ! git --version >/dev/null 2>&1; then
  echo "error: git is on PATH but failed to run." >&2
  exit 1
fi

export VAULT_PATH="$VAULT"
export WORKSPACES_ROOT="$DATA_DIR"
export AUTH_DISABLED=true
unset DATABASE_URL || true
export HOST
export PORT
export NODE_ENV=production
export NITRO_HOST="$HOST"
export NITRO_PORT="$PORT"

URL="http://${HOST}:${PORT}"
echo "Fluffmind solo"
echo "  vault: $VAULT_PATH"
echo "  url:   $URL"
echo "  (Ctrl+C to stop)"

open_browser() {
  if [[ "$OPEN_BROWSER" != "1" ]]; then
    return 0
  fi
  # Wait until the server accepts connections (max ~30s)
  for _ in $(seq 1 60); do
    if command -v curl >/dev/null 2>&1; then
      if curl -sf -o /dev/null "$URL/api/health" 2>/dev/null || curl -sf -o /dev/null "$URL/" 2>/dev/null; then
        break
      fi
    else
      sleep 1
      break
    fi
    sleep 0.5
  done
  case "$(uname -s)" in
    Darwin) open "$URL" >/dev/null 2>&1 || true ;;
    Linux) xdg-open "$URL" >/dev/null 2>&1 || true ;;
  esac
}

open_browser &
exec "$NODE_BIN" "$SERVER_ENTRY"
