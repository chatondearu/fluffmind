# Fluffmind

The fluffy, open-source second brain.

Fluffmind is a self-hostable, git-backed personal knowledge management (PKM) app — an open source alternative to Obsidian. Markdown files + wikilinks stay the single source of truth (stored in a Git repo, no lock-in), with a modern editing experience on top:

- **Custom block editor** (Notion-style drag & drop), built from scratch — no third-party editor framework.
- **Git/GitHub sync**, orchestrated server-side (not per-client), so multi-device just works.
- **Multi-account workspaces** (Drizzle + Postgres + Better Auth), with permissions either synced from GitHub repo collaborators or managed manually.
- **MCP server** exposing the vault to AI agents — local (stdio) or remote (HTTP), depending on how the app is deployed.
- **100% web.** Runs the same way locally or on a public server, no native app.

## Status

Early planning — no application code yet. This repo previously held an unrelated first attempt (Nuxt + Supabase scaffold); it's been cleared to restart on the current architecture.

See the [Project board](../../projects) and [Milestones](../../milestones) for the roadmap and current work. Design decisions and the full PRD live in project notes (not in this repo yet).

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
locally or on a public server (see the PRD).

### Deploying (Coolify)

`docker-compose.coolify.yml` is meant to be used as a Coolify "Docker Compose" resource
— Coolify substitutes its own magic environment variables (domain generation, random
Postgres credentials) at deploy time, nothing to fill in by hand. See the comments in
that file. Note: there's no Git sync yet (P1), so a freshly deployed instance starts
with an empty vault volume.
