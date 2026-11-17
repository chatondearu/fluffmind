#!/usr/bin/env bash
# Start the local Docker stack (web + Postgres) mirroring Coolify layout.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  echo "Creating .env from .env.example — set VAULT_PATH to your markdown vault."
  cp .env.example .env
fi

# shellcheck disable=SC1091
source .env

if [ -z "${VAULT_PATH:-}" ] || [ ! -d "$VAULT_PATH" ]; then
  echo "Error: VAULT_PATH must point to an existing directory (currently: ${VAULT_PATH:-unset})"
  echo "Example: mkdir -p ~/vault && echo '# Notes' > ~/vault/welcome.md"
  echo "Then set VAULT_PATH=$HOME/vault in .env"
  exit 1
fi

# docker-compose.yml has no default daemon token: generate a random one once.
if [ -z "${FLUFFMIND_DAEMON_TOKEN:-}" ]; then
  FLUFFMIND_DAEMON_TOKEN="$(od -An -tx1 -N24 /dev/urandom | tr -d ' \n')"
  echo "FLUFFMIND_DAEMON_TOKEN=$FLUFFMIND_DAEMON_TOKEN" >>.env
  echo "Generated FLUFFMIND_DAEMON_TOKEN in .env"
fi

echo "Starting stack (VAULT_PATH=$VAULT_PATH)…"
docker compose up --build "$@"
