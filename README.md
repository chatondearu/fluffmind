# Fluffmind

**The fluffy, open-source second brain.**

Self-hostable, git-backed personal knowledge management — an open-source alternative to Obsidian. Your notes stay plain markdown + wikilinks in a Git repo (no lock-in). Fluffmind adds a modern web UI, server-side sync, and an MCP bridge for AI agents.

[Project board](https://github.com/users/chatondearu/projects/3) · [Milestones](https://github.com/chatondearu/fluffmind/milestones) · [Releases](https://github.com/chatondearu/fluffmind/releases)

---

## Why Fluffmind

- **Your files, forever** — markdown + frontmatter in Git are the only source of truth. Compatible with Foam/Obsidian vaults; walk away anytime.
- **Block editor that feels modern** — Notion-style drag & drop, built from scratch (no third-party editor framework).
- **Sync that just works** — Git/GitHub is orchestrated server-side, so multi-device doesn’t mean multi-writer chaos.
- **Workspaces when you need them** — multi-account auth (Better Auth + Postgres), with permissions from GitHub collaborators or managed manually.
- **AI-ready** — MCP server (stdio or HTTP) so agents can search, read, write, and traverse your vault.
- **100% web** — same app locally or on a public server. Portable solo package: unzip and run, no Docker/Postgres.

**Stack:** Nuxt 3 · pnpm + Turborepo · Reka UI · UnoCSS · Material Design 3 · Drizzle · Postgres · Better Auth · MCP

---

## Quick start

### Portable solo (no Docker, no Postgres)

Download a release for your OS from [Releases](https://github.com/chatondearu/fluffmind/releases)
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

### Dev (fastest inner loop)

```sh
pnpm install
VAULT_PATH=/absolute/path/to/a/markdown/vault pnpm --filter @fluffmind/web dev

# Browse without allowing writes:
VAULT_PATH=/absolute/path/to/a/markdown/vault VAULT_READONLY=true pnpm --filter @fluffmind/web dev
```

### Docker

```sh
cp .env.example .env   # set VAULT_PATH to a real markdown vault
./scripts/stack-local.sh
```

Or manually: `docker compose up --build`. Opens http://localhost:3000 with Postgres +
hot-reload dev server inside the container.

### Deploying (Coolify)

`docker-compose.coolify.yml` is meant to be used as a Coolify "Docker Compose" resource.
`DATABASE_URL` is wired automatically to the Compose Postgres service — you normally
only set the variables below in Coolify’s Environment UI.

**Solo mode (fastest):** leave `AUTH_DISABLED=true` (default), set `GIT_REMOTE_URL`
optionally, deploy.

**Multi-account mode (Better Auth):**

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `AUTH_DISABLED` | yes | `false` |
| `BETTER_AUTH_SECRET` | yes | ≥ 32 random bytes (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | yes | Public URL, e.g. `https://fluffmind.example.com` (no trailing slash) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | for GitHub login | GitHub **OAuth App** (identity) |
| `GITHUB_SYNC_TOKEN_SECRET` | recommended | Encrypts workspace PAT links at rest |

GitHub OAuth App callback URL: `{BETTER_AUTH_URL}/api/auth/callback/github`.  
First signup on an empty instance becomes admin and can create the first workspace.

**GitHub App (optional, multi-repo org linking):** set `GITHUB_APP_ID`,
`GITHUB_APP_PRIVATE_KEY` (PEM; use `\n` for newlines in Coolify), `GITHUB_APP_SLUG`,
and preferably `GITHUB_APP_WEBHOOK_SECRET` (falls back to `GITHUB_WEBHOOK_SECRET`).
App permissions: Contents R/W, Metadata R, Members/collaborators R. Install flow +
workspace repo bind live under Settings; PAT linking remains a fallback. See
ADR-009 / PRD-033.

**Webhooks:** point GitHub at `POST {BETTER_AUTH_URL}/api/webhooks/github` (push +
installation events when using a GitHub App).

**Schema:** after deploy, run Drizzle migrations against Postgres when new SQL lands
under `packages/db/drizzle/` (e.g. `0001_*` for GitHub App link columns).

Health check: `GET /api/health` (used by Docker healthcheck).

---

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

---

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

---

## Status & docs

MVP + post-MVP UX are shipped, including distributed workspace lock (P7a) and portable solo packaging (P8a). Multi-disk scale-out and static publish remain deferred under epic [#28](https://github.com/chatondearu/fluffmind/issues/28).

| Doc | Purpose |
| --- | ------- |
| [`DESIGN.md`](./DESIGN.md) | Why the architecture looks like this |
| [`AGENTS.md`](./AGENTS.md) | Conventions and gotchas for humans & agents |
| [Project board](https://github.com/users/chatondearu/projects/3) | Current work |
| [Milestones](https://github.com/chatondearu/fluffmind/milestones) | P0 → P7 history |
