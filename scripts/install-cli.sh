#!/usr/bin/env bash
# Install @fluffmind/cli from npm (when published) or via a monorepo pnpm wrapper.
# Writes a wrapper to "${FLUFFMIND_BIN_DIR:-$HOME/.local/bin}/fluffmind"
set -euo pipefail

# BASH_SOURCE[0] is unset when this script is streamed to bash's stdin
# (e.g. `curl ... | bash`), so it must be defaulted under `set -u`.
SCRIPT_SOURCE="${BASH_SOURCE[0]:-}"
if [[ -n "$SCRIPT_SOURCE" ]]; then
  DETECTED_ROOT="$(cd "$(dirname "$SCRIPT_SOURCE")/.." && pwd)"
else
  DETECTED_ROOT=""
fi

BIN_DIR="${FLUFFMIND_BIN_DIR:-$HOME/.local/bin}"
FLUFFMIND_ROOT="${FLUFFMIND_ROOT:-$DETECTED_ROOT}"
INSTALL_MODE="${FLUFFMIND_INSTALL_MODE:-auto}"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) ARCH="x64" ;;
  aarch64 | arm64) ARCH="arm64" ;;
esac

npm_package_available() {
  npm view @fluffmind/cli version --json >/dev/null 2>&1
}

install_via_npm() {
  echo "Installing @fluffmind/cli from npm (${OS}/${ARCH})…"
  npm install -g @fluffmind/cli
  echo "Installed fluffmind via npm. Ensure $(npm prefix -g)/bin is on your PATH."
}

install_via_wrapper() {
  if [[ -z "$FLUFFMIND_ROOT" ]]; then
    echo "error: could not determine the Fluffmind repo location." >&2
    echo "This usually means the script was piped to bash (e.g. curl ... | bash)," >&2
    echo "so it can't find its own path on disk." >&2
    echo >&2
    echo "Fix: clone the repo and set FLUFFMIND_ROOT, e.g.:" >&2
    echo "  git clone https://github.com/chatondearu/fluffmind && cd fluffmind" >&2
    echo "  FLUFFMIND_ROOT=\"\$PWD\" ./scripts/install-cli.sh" >&2
    echo "Or, once @fluffmind/cli is published on npm:" >&2
    echo "  FLUFFMIND_INSTALL_MODE=npm ./scripts/install-cli.sh" >&2
    exit 1
  fi

  if [[ ! -f "$FLUFFMIND_ROOT/packages/cli/package.json" ]]; then
    echo "error: packages/cli not found under FLUFFMIND_ROOT=$FLUFFMIND_ROOT" >&2
    echo "Clone the repo, set FLUFFMIND_ROOT, or use FLUFFMIND_INSTALL_MODE=npm once published." >&2
    exit 1
  fi

  if ! command -v pnpm >/dev/null 2>&1; then
    echo "error: pnpm is required for monorepo install (or use FLUFFMIND_INSTALL_MODE=npm)" >&2
    exit 1
  fi

  if [[ ! -d "$FLUFFMIND_ROOT/node_modules" ]]; then
    echo "Running pnpm install in $FLUFFMIND_ROOT…"
    pnpm --dir "$FLUFFMIND_ROOT" install
  fi

  mkdir -p "$BIN_DIR"
  local wrapper="$BIN_DIR/fluffmind"
  cat >"$wrapper" <<EOF
#!/usr/bin/env bash
set -euo pipefail
FLUFFMIND_ROOT="\${FLUFFMIND_ROOT:-$FLUFFMIND_ROOT}"
exec pnpm --dir "\$FLUFFMIND_ROOT" --filter @fluffmind/cli start "\$@"
EOF
  chmod +x "$wrapper"

  echo "Installed fluffmind wrapper to $wrapper (FLUFFMIND_ROOT=$FLUFFMIND_ROOT)"
  echo "Ensure $BIN_DIR is on your PATH."
  echo "Alternative: pnpm --filter @fluffmind/cli link --global"
}

# @fluffmind/cli is not published on npm yet (private package) — "auto" only
# tries the monorepo wrapper. Npm install must be requested explicitly, and
# fails loudly rather than silently falling back, so a mistyped mode never
# looks like a successful no-op.
if [[ "$INSTALL_MODE" == "npm" ]]; then
  if ! npm_package_available; then
    echo "error: @fluffmind/cli is not published on npm yet." >&2
    echo "Use FLUFFMIND_INSTALL_MODE=monorepo (default when a checkout is detected) instead." >&2
    exit 1
  fi
  install_via_npm
elif [[ "$INSTALL_MODE" == "monorepo" ]]; then
  install_via_wrapper
elif [[ "$INSTALL_MODE" == "auto" ]]; then
  install_via_wrapper
else
  echo "error: unknown FLUFFMIND_INSTALL_MODE=$INSTALL_MODE (expected auto, monorepo, or npm)" >&2
  exit 1
fi
