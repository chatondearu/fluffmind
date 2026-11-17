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
# Sync daemon sidecar (ADR-020): loopback only, started before Nuxt.
DAEMON_BIN="$ROOT/bin/fluffmind-daemon"
DAEMON_PID_FILE="$DATA_DIR/fluffmind-daemon.pid"
DAEMON_LOG_FILE="$DATA_DIR/fluffmind-daemon.log"
DAEMON_PORT="${FLUFFMIND_DAEMON_PORT:-8787}"
USE_DAEMON=1

VAULT=""
PORT="${PORT:-3000}"
HOST="${HOST:-127.0.0.1}"
OPEN_BROWSER=1
READONLY=0
CMD="run"

usage() {
  cat <<'EOF'
Fluffmind portable (solo mode — no Docker, no Postgres)

Usage:
  fluffmind [command] [--vault <path>] [--port <n>] [--host <addr>] [--readonly] [--no-open]
            [--no-daemon] [--daemon-port <n>] [--help]

Commands:
  run      Start in the foreground (default; Ctrl+C stops)
  start    Start in the background (no terminal needed)
  stop     Stop a background instance
  status   Show whether a background instance is running

Vault resolution (first match wins):
  1. --vault <path>
  2. VAULT_PATH environment variable
  3. <package>/vault

Options:
  --readonly   Reject vault mutations (sets VAULT_READONLY=true; implies --no-daemon)
  --no-daemon  Skip the sync daemon sidecar (Git-live solo, as before)
  --daemon-port <n>  Sync daemon loopback port (default: 8787)

Requires: git on PATH
EOF
}

# Find a live process still serving this package's Nitro entry.
# Needed after `package:portable` overwrites data/ and drops the PID file
# while an old Node process keeps running with stale chunk hashes.
find_server_pid() {
  pgrep -f "$SERVER_ENTRY" 2>/dev/null | head -n1 || true
}

recover_pid_file() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    rm -f "$PID_FILE"
  fi
  local orphan
  orphan="$(find_server_pid)"
  if [[ -n "$orphan" ]]; then
    echo "$orphan" >"$PID_FILE"
  fi
}

is_running() {
  recover_pid_file
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

stop_pid() {
  local pid="$1"
  [[ -n "$pid" ]] || return 0
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
}

# Plain HTTP GET /health over bash's /dev/tcp (no curl dependency).
daemon_healthy() {
  (
    exec 3<>"/dev/tcp/127.0.0.1/$DAEMON_PORT" || exit 1
    printf 'GET /health HTTP/1.0\r\n\r\n' >&3
    head -n1 <&3 | grep -q ' 200 '
  ) 2>/dev/null
}

stop_daemon() {
  [[ -f "$DAEMON_PID_FILE" ]] || return 0
  local pid
  pid="$(cat "$DAEMON_PID_FILE" 2>/dev/null || true)"
  # Guard against a recycled pid (e.g. after a reboot): only kill our daemon.
  # args, not comm: Linux truncates comm to 15 chars ("fluffmind-daemo").
  if [[ -n "$pid" ]] && ps -p "$pid" -o args= 2>/dev/null | grep -q fluffmind-daemon; then
    stop_pid "$pid"
  fi
  rm -f "$DAEMON_PID_FILE"
}

# Start the daemon and wait for /health; exports NUXT_PUBLIC_DAEMON_URL for Nuxt.
start_daemon() {
  [[ "$USE_DAEMON" == "1" ]] || return 0
  if [[ ! -x "$DAEMON_BIN" ]]; then
    # Archive built with --no-daemon: fall back to Git-live solo (ADR-018).
    echo "warning: sync daemon not found at $DAEMON_BIN — running without it (Git-live)" >&2
    USE_DAEMON=0
    return 0
  fi
  # Reap a daemon left behind by a crashed launcher.
  stop_daemon
  mkdir -p "$DATA_DIR/daemon"
  FLUFFMIND_DAEMON_DATA="$DATA_DIR/daemon" nohup "$DAEMON_BIN" \
    --vault "$VAULT" --host 127.0.0.1 --port "$DAEMON_PORT" >>"$DAEMON_LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" >"$DAEMON_PID_FILE"
  for _ in $(seq 1 100); do
    if daemon_healthy && kill -0 "$pid" 2>/dev/null; then
      export NUXT_PUBLIC_DAEMON_URL="http://127.0.0.1:$DAEMON_PORT"
      return 0
    fi
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.2
  done
  echo "error: sync daemon failed to start on port $DAEMON_PORT — see $DAEMON_LOG_FILE" >&2
  echo "  (port in use? try --daemon-port <n>, or --no-daemon)" >&2
  stop_daemon
  exit 1
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
    --readonly)
      READONLY=1
      shift
      ;;
    --no-daemon)
      USE_DAEMON=0
      shift
      ;;
    --daemon-port)
      DAEMON_PORT="${2:-}"
      shift 2
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
    if [[ -f "$DAEMON_PID_FILE" ]] && kill -0 "$(cat "$DAEMON_PID_FILE")" 2>/dev/null; then
      echo "  sync daemon: running (pid $(cat "$DAEMON_PID_FILE"))"
    fi
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
    stop_daemon
    exit 0
  fi
  pid="$(cat "$PID_FILE")"
  echo "Stopping Fluffmind (pid $pid)…"
  stop_pid "$pid"
  # Sweep any leftover orphans from a previous rebuild.
  while true; do
    orphan="$(find_server_pid)"
    [[ -n "$orphan" ]] || break
    echo "Stopping orphan Fluffmind (pid $orphan)…"
    stop_pid "$orphan"
  done
  rm -f "$PID_FILE"
  stop_daemon
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

if [[ "$READONLY" == "1" ]]; then
  export VAULT_READONLY=true
else
  # Preserve an already-exported VAULT_READONLY from the environment.
  :
fi

READONLY_LABEL="no"
if [[ "${VAULT_READONLY:-}" == "true" ]]; then
  READONLY_LABEL="yes"
  # The daemon's PUT /v1/notes does not honour VAULT_READONLY: keep it out of read-only runs.
  USE_DAEMON=0
fi

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
  start_daemon
  echo "Fluffmind solo (background)"
  echo "  vault: $VAULT_PATH"
  echo "  readonly: $READONLY_LABEL"
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
    stop_daemon
    exit 1
  fi
  open_browser &
  exit 0
fi

# Foreground (run): Nuxt runs as a child so the traps can stop it and the daemon together.
# Refuse when an instance is up: start_daemon would reap its daemon, and our trap would
# then kill the replacement, leaving that instance on a dead daemon.
if is_running; then
  echo "Fluffmind is already running (pid $(cat "$PID_FILE"))." >&2
  echo "  url: $URL" >&2
  echo "  Use: $(basename "$0") stop" >&2
  exit 1
fi
start_daemon
echo "Fluffmind solo"
echo "  vault: $VAULT_PATH"
echo "  readonly: $READONLY_LABEL"
echo "  url:   $URL"
echo "  (Ctrl+C to stop — or use: $(basename "$0") start)"
open_browser &
"$NODE_BIN" "$SERVER_ENTRY" &
NODE_PID=$!
cleanup() {
  trap - EXIT
  stop_pid "$NODE_PID"
  stop_daemon
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
wait "$NODE_PID"
