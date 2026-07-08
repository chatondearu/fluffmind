# Fluffmind

The fluffy, open-source second brain.

Fluffmind is a self-hostable, git-backed personal knowledge management (PKM) app — an open source alternative to Obsidian. Markdown files + wikilinks stay the single source of truth (stored in a Git repo, no lock-in), with a modern editing experience on top:

- **Custom block editor** (Notion-style drag & drop), built from scratch — no third-party editor framework.
- **Git/GitHub sync**, orchestrated server-side (not per-client), so multi-device just works.
- **Multi-account workspaces** (Drizzle + Postgres + Better Auth), with permissions either synced from GitHub repo collaborators or managed manually.
- **MCP server** exposing the vault to AI agents — local (stdio) or remote (HTTP), depending on how the app is deployed.
- **100% web.** Runs the same way locally or on a public server, no native app.

## Status

P0 (foundations: read-only vault engine, design system, viewer) and P1 (server-side
Git sync — `writeToWorkspace`, note creation, sync status) are done. See the
[Project board](../../projects) and [Milestones](../../milestones) for the roadmap and
current work.

Architecture decisions and rationale: `DESIGN.md`. Conventions and gotchas for anyone
(human or agent) working in this repo: `AGENTS.md`.

## Planned stack

Nuxt 3 · pnpm workspaces + Turborepo · Reka UI · UnoCSS · Material Design 3 · Drizzle ORM · Postgres · Better Auth · Model Context Protocol (MCP)

## Running it

### Directly (fastest inner loop)

```sh
pnpm install
VAULT_PATH=/absolute/path/to/a/markdown/vault pnpm --filter @fluffmind/web dev
```

### With Docker

```sh
cp .env.example .env   # set VAULT_PATH to a real markdown vault
docker compose up
```

Runs the Nuxt dev server (hot reload, source bind-mounted) plus a Postgres instance —
Postgres isn't consumed by the app yet (auth/workspaces land in P2), it's there so the
local stack already matches the target self-hosting shape: the same Docker image runs
locally or on a public server (see `DESIGN.md`).

### Deploying (Coolify)

`docker-compose.coolify.yml` is meant to be used as a Coolify "Docker Compose" resource
— Coolify substitutes its own magic environment variables (domain generation, random
Postgres credentials) at deploy time. Set `GIT_REMOTE_URL` in Coolify's environment
UI to clone and push a remote vault repo; without it, notes still persist locally in
the `vault-data` volume (git-inited on first write). See the comments in that file and
`.env.example` for the HTTPS + token format.
