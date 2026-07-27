# Getting started

Pick the path that matches how you want to run Fluffmind.

## Portable solo (no Docker, no Postgres)

Download a release for your OS from [Releases](https://github.com/chatondearu/fluffmind/releases)
(`fluffmind-darwin-arm64.tar.gz`, `linux-x64`, `win-x64`, …), unzip, then:

```sh
./bin/fluffmind start
./bin/fluffmind status
./bin/fluffmind stop

./bin/fluffmind
./bin/fluffmind start --vault /path/to/notes
./bin/fluffmind start --vault /path/to/notes --readonly
./bin/fluffmind start --port 3456 --no-open
```

Requires **Git on PATH**. Node is embedded. Auth/Postgres are disabled.
`--readonly` (or `VAULT_READONLY=true`) rejects note/folder mutations with HTTP 403.

Build from source:

```sh
pnpm install
pnpm package:portable
pnpm portable:start
```

## Local development

```sh
pnpm install
VAULT_PATH=/absolute/path/to/a/markdown/vault pnpm --filter @fluffmind/web dev
```

## Docker

```sh
cp .env.example .env
./scripts/stack-local.sh
```

Or `docker compose up --build` → http&#58;//localhost&#58;3000

Next: [Self-hosting](./self-hosting) · [MCP](./mcp)
