# Fluffmind

The fluffy, open-source second brain.

Fluffmind is a self-hostable, git-backed personal knowledge management (PKM) app — an open source alternative to Obsidian. Markdown files + wikilinks stay the single source of truth (stored in a Git repo, no lock-in), with a modern editing experience on top:

- **Custom block editor** (Notion-style drag & drop), built from scratch — no third-party editor framework.
- **Git/GitHub sync**, orchestrated server-side (not per-client), so multi-device just works.
- **Multi-account workspaces** (Drizzle + Postgres + Better Auth), with permissions either synced from GitHub repo collaborators or managed manually.
- **MCP server** exposing the vault to AI agents — local (stdio) or remote (HTTP), depending on how the app is deployed.
- **100% web.** Runs the same way locally or on a public server, no native app.

## Status

**MVP + post-MVP UX shipped**, plus **P7a** distributed lock and **P8a** portable solo packaging (PRD-032).
P7b/c (multi-disk, static publish) remain deferred under epic [#28](https://github.com/chatondearu/fluffmind/issues/28).

See the [Project board](https://github.com/users/chatondearu/projects/3) and
[Milestones](https://github.com/chatondearu/fluffmind/milestones) for history.

Architecture decisions and rationale: `DESIGN.md`. Conventions and gotchas for anyone
(human or agent) working in this repo: `AGENTS.md`.

## Planned stack

Nuxt 3 · pnpm workspaces + Turborepo · Reka UI · UnoCSS · Material Design 3 · Drizzle ORM · Postgres · Better Auth · Model Context Protocol (MCP)

## Running it

### Portable solo (no Docker, no Postgres)

Download a release asset for your OS from [Releases](https://github.com/chatondearu/fluffmind/releases)
(`fluffmind-darwin-arm64.tar.gz`, `linux-x64`, `win-x64`, …), unzip, then:

```sh
./bin/fluffmind start                    # background — close the terminal freely
./bin/fluffmind status
./bin/fluffmind stop

./bin/fluffmind                          # foreground (Ctrl+C to stop)
./bin/fluffmind start --vault /path/to/notes
./bin/fluffmind start --vault /path/to/notes --readonly
./bin/fluffmind start --port 3456 --no-open
```

Requires **Git on PATH**. Node is embedded. Auth/Postgres are disabled.
`--readonly` (or `VAULT_READONLY=true`) rejects note/folder mutations with HTTP 403.
Background PID/log: `data/fluffmind.pid` / `data/fluffmind.log`.

Build a package locally:

```sh
pnpm install
pnpm package:portable                    # current OS/arch
pnpm package:portable -- --target all  # or darwin-arm64|linux-x64|…

# Then from the repo (uses dist/portable/fluffmind-<os>-<arch>/):
pnpm portable:start                      # background
pnpm portable:status
pnpm portable:stop
pnpm portable:start -- --vault /path/to/notes --port 3456 --readonly
```

Artifacts land in `dist/portable/`.

### Directly (fastest inner loop)

```sh
pnpm install
VAULT_PATH=/absolute/path/to/a/markdown/vault pnpm --filter @fluffmind/web dev

# Browse without allowing writes:
VAULT_PATH=/absolute/path/to/a/markdown/vault VAULT_READONLY=true pnpm --filter @fluffmind/web dev
```

### With Docker

```sh
cp .env.example .env   # set VAULT_PATH to a real markdown vault
./scripts/stack-local.sh
```

Or manually: `docker compose up --build`. Opens http://localhost:3000 with Postgres +
hot-reload dev server inside the container.

### Deploying (Coolify)

`docker-compose.coolify.yml` is meant to be used as a Coolify "Docker Compose" resource.

**Solo mode (fastest):** leave `AUTH_DISABLED=true` (default), set `GIT_REMOTE_URL` optionally, deploy.

**Multi-account mode:** set `AUTH_DISABLED=false`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (public URL),
configure GitHub OAuth (`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`). First signup creates a workspace automatically.

**Webhooks (external Git edits):** set `GITHUB_WEBHOOK_SECRET`, add a GitHub webhook on `POST /api/webhooks/github` (push events).

Health check: `GET /api/health` (used by Docker healthcheck).

## Releasing

GitHub Releases are produced by [`.github/workflows/release-portable.yml`](.github/workflows/release-portable.yml).

1. Push a version tag: `git tag v0.1.0 && git push origin v0.1.0`
2. The workflow builds portable archives on four runners (`darwin-arm64`, `darwin-x64`, `linux-x64`, `win-x64`) and attaches them to the release, plus `SHA256SUMS`.
3. Or run the workflow manually (**Actions → Release portable → Run workflow**) without creating a GitHub Release (artifacts only). Tag pushes both build **and** publish a Release.

Each asset is an unzip-and-run solo package (embedded Node 22, no Postgres). See [Portable solo](#portable-solo-no-docker-no-postgres) above for end-user instructions.

Local dry-run (current machine only):

```sh
pnpm package:portable -- --target current
# → dist/portable/fluffmind-<os>-<arch>.tar.gz|.zip
```

## MCP (AI agents)

Fluffmind exposes vault tools over [Model Context Protocol](https://modelcontextprotocol.io):

| Tool | Description |
| ---- | ----------- |
| `search_notes` | Search by title or id |
| `read_note` | Read markdown + frontmatter |
| `write_note` | Create/update via `writeToWorkspace` |
| `list_backlinks` | Incoming wikilinks |
| `get_graph` | Vault link graph |
| `create_task` | Append `- [ ]` task (default note: `inbox/tasks`) |

### Local (stdio)

For Claude Code, Cursor, or other stdio MCP clients on the same machine:

```sh
VAULT_PATH=/absolute/path/to/your/vault pnpm --filter @fluffmind/web mcp:stdio
```

Example Cursor config (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "fluffmind": {
      "command": "pnpm",
      "args": ["--filter", "@fluffmind/web", "mcp:stdio"],
      "env": {
        "VAULT_PATH": "/absolute/path/to/your/vault"
      }
    }
  }
}
```

### Remote (HTTP)

When the Nuxt app is running, agents can connect to **`/api/mcp`** (Streamable HTTP).
If auth is enabled (`DATABASE_URL` set and `AUTH_DISABLED` not true), the client must
send the same session cookies as the web UI (or authenticate first).
