#!/usr/bin/env bash
# Fluffmind portable launcher (unix). Packaged under bin/fluffmind.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$ROOT/runtime/node/bin/node"
SERVER_ENTRY="$ROOT/app/.output/server/index.mjs"
DEFAULT_VAULT="$ROOT/vault"
DATA_DIR="$ROOT/data"
PID_FILE="$DATA_DIR/fluffmind.pid"
LOG_FILE="$DATA_DIR/fluffmind.log"

VAULT=""
PORT="${PORT:-3000}"
HOST="${HOST:-127.0.0.1}"
OPEN_BROWSER=1
CMD="run"

usage() {
  cat <<'EOF'
Fluffmind portable (solo mode — no Docker, no Postgres)

Usage:
  fluffmind [command] [--vault <path>] [--port <n>] [--host <addr>] [--no-open] [--help]

Commands:
  run      Start in the foreground (default; Ctrl+C stops)
  start    Start in the background (no terminal needed)
  stop     Stop a background instance
  status   Show whether a background instance is running

Vault resolution (first match wins):
  1. --vault <path>
  2. VAULT_PATH environment variable
  3. <package>/vault

Requires: git on PATH
EOF
}

is_running() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    run|start|stop|status)
      CMD="$1"
      shift
      ;;
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

mkdir -p "$DATA_DIR"

if [[ "$CMD" == "status" ]]; then
  if is_running; then
    pid="$(cat "$PID_FILE")"
    echo "Fluffmind is running (pid $pid)"
    echo "  log: $LOG_FILE"
    exit 0
  fi
  echo "Fluffmind is not running"
  [[ -f "$PID_FILE" ]] && rm -f "$PID_FILE"
  exit 1
fi

if [[ "$CMD" == "stop" ]]; then
  if ! is_running; then
    echo "Fluffmind is not running"
    rm -f "$PID_FILE"
    exit 0
  fi
  pid="$(cat "$PID_FILE")"
  echo "Stopping Fluffmind (pid $pid)…"
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 0.25
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  echo "Stopped."
  exit 0
fi

if [[ -z "$VAULT" ]]; then
  if [[ -n "${VAULT_PATH:-}" ]]; then
    VAULT="$VAULT_PATH"
  else
    VAULT="$DEFAULT_VAULT"
  fi
fi

mkdir -p "$VAULT" "$DATA_DIR"

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

open_browser() {
  if [[ "$OPEN_BROWSER" != "1" ]]; then
    return 0
  fi
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

if [[ "$CMD" == "start" ]]; then
  if is_running; then
    echo "Fluffmind is already running (pid $(cat "$PID_FILE"))."
    echo "  url: $URL"
    echo "  Use: $(basename "$0") stop"
    exit 1
  fi
  rm -f "$PID_FILE"
  echo "Fluffmind solo (background)"
  echo "  vault: $VAULT_PATH"
  echo "  url:   $URL"
  echo "  log:   $LOG_FILE"
  echo "  stop:  $(basename "$0") stop"
  nohup "$NODE_BIN" "$SERVER_ENTRY" >>"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  # Give the process a moment; fail if it died immediately
  sleep 0.4
  if ! is_running; then
    echo "error: server exited immediately — see $LOG_FILE" >&2
    rm -f "$PID_FILE"
    exit 1
  fi
  open_browser &
  exit 0
fi

# Foreground (run)
echo "Fluffmind solo"
echo "  vault: $VAULT_PATH"
echo "  url:   $URL"
echo "  (Ctrl+C to stop — or use: $(basename "$0") start)"
open_browser &
exec "$NODE_BIN" "$SERVER_ENTRY"
