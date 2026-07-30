#!/usr/bin/env bash
# Install @fluffmind/cli from npm (when published) or via a monorepo pnpm wrapper.
# Writes a wrapper to "${FLUFFMIND_BIN_DIR:-$HOME/.local/bin}/fluffmind"
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${FLUFFMIND_BIN_DIR:-$HOME/.local/bin}"
FLUFFMIND_ROOT="${FLUFFMIND_ROOT:-$ROOT}"
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

if [[ "$INSTALL_MODE" == "npm" ]]; then
  install_via_npm
elif [[ "$INSTALL_MODE" == "monorepo" ]]; then
  install_via_wrapper
elif [[ "$INSTALL_MODE" == "auto" ]] && npm_package_available; then
  install_via_npm
else
  install_via_wrapper
fi
