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
./bin/fluffmind                          # uses ./vault next to the package
./bin/fluffmind --vault /path/to/notes   # existing Foam/Obsidian vault
./bin/fluffmind --port 3456 --no-open
```

Requires **Git on PATH**. Node is embedded. Auth/Postgres are disabled.

Build a package locally:

```sh
pnpm install
pnpm package:portable                    # current OS/arch
pnpm package:portable -- --target all  # or darwin-arm64|linux-x64|…
```

Artifacts land in `dist/portable/`.

### Directly (fastest inner loop)

```sh
pnpm install
VAULT_PATH=/absolute/path/to/a/markdown/vault pnpm --filter @fluffmind/web dev
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
