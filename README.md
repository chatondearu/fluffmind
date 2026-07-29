# Fluffmind

**The fluffy, open-source second brain.**

Self-hostable, git-backed personal knowledge management — an open-source alternative to Obsidian. Your notes stay plain markdown + wikilinks in a Git repo (no lock-in). Fluffmind adds a modern web UI, server-side sync, and an MCP bridge for AI agents.

[Docs](https://chatondearu.github.io/fluffmind/) · [Project board](https://github.com/users/chatondearu/projects/3) · [Milestones](https://github.com/chatondearu/fluffmind/milestones) · [Releases](https://github.com/chatondearu/fluffmind/releases)

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

**GitHub App (optional):** for multi-workspace / multi-repo autonomy without pasting
PATs, follow [GitHub App setup (self-hosted)](#github-app-setup-self-hosted) below.

**Webhooks:** point GitHub at `POST {BETTER_AUTH_URL}/api/webhooks/github` (push +
installation events when using a GitHub App).

**Schema:** with `AUTH_DISABLED=false`, the container entrypoint applies Drizzle
migrations automatically (with retries until Postgres accepts connections). Solo
mode skips this. New SQL under `packages/db/drizzle/` is applied on the next
auth-enabled deploy.

Health check: `GET /api/health` (used by Docker healthcheck). With auth on, the
web service waits for Postgres to be healthy before starting.

### GitHub App setup (self-hosted)

Fluffmind uses **two** GitHub integrations on purpose:

| Integration | Env | Role |
| ----------- | --- | ---- |
| **OAuth App** | `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | User **login** only |
| **GitHub App** | `GITHUB_APP_*` | **Repo access** for workspaces (clone/push + collaborator sync) |

With a GitHub App configured, an org admin installs it once, then each Fluffmind
**workspace** binds **one repository** under Settings → workspace (mode `app`). No
per-workspace PAT. One installation can back many workspaces (one repo each).

When creating a workspace, owners can optionally tick **Créer un dépôt GitHub** to
create and link a new repository (default name `fluff-<slug>`, private) in one step.
You can still link an existing repo instead. If GitHub creation fails, the workspace
is still created — retry from **Settings → workspace** via **Créer un dépôt**.

> **Operators:** after adding the **Administration** permission below, **re-approve**
> the App installation on GitHub so the new scope takes effect.

See also: [Docs → GitHub App setup](https://chatondearu.github.io/fluffmind/guide/github-app-setup)

#### 1. Create the GitHub App

1. GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App**
   (user or org that will own the App credentials for this Fluffmind instance).
2. **GitHub App name** / slug — remember the slug (`GITHUB_APP_SLUG`).
3. **Homepage URL:** your public Fluffmind URL (`BETTER_AUTH_URL`).
4. **Callback URL** (user authorization / OAuth — required for GitHub login):

   ```text
   {BETTER_AUTH_URL}/api/auth/callback/github
   ```

   Example: `https://fluffmind.example.com/api/auth/callback/github`.

   After creating the App, copy its **Client ID** and generate a **Client secret** →
   `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`. (Alternatively use a separate GitHub
   **OAuth App** with the same callback URL.)
5. **Webhook:**
   - Active: yes
   - Webhook URL: `https://<your-fluffmind-host>/api/webhooks/github`
   - Webhook secret: generate one → `GITHUB_APP_WEBHOOK_SECRET` (preferred) or
     `GITHUB_WEBHOOK_SECRET`
6. **Permissions** — full checklist in
   [Docs → GitHub App setup](https://chatondearu.github.io/fluffmind/guide/github-app-setup):

   | Scope | Permission | Access | Required |
   | ----- | ---------- | ------ | -------- |
   | Repository | Contents | Read & write | yes |
   | Repository | Metadata | Read | yes |
   | Repository | Members | Read | yes |
   | Repository | Administration | Read & write | recommended (create repos) |
   | Account | Email addresses | Read | recommended (login email) |

   Subscribe to events: **Push**, **Installation**, **Installation repositories**.
   Fluffmind **Settings** shows a live ✓ / ○ checklist via `GET /api/github/app/status`.

7. Create the App → note **App ID** (`GITHUB_APP_ID`).
8. **Generate a private key** → download the `.pem` → store as
   `GITHUB_APP_PRIVATE_KEY` (in Coolify / `.env`, put the PEM on one line with `\n`
   for newlines).
9. Under **Install App**, you will install on the org/user after Fluffmind env is set
   (or use Fluffmind Settings → « Installer l’application » once `GITHUB_APP_SLUG` is
   set).

#### 2. Coolify / env

Set on the Fluffmind instance (in addition to Better Auth):

```sh
# Login — Client ID/secret from the GitHub App (or a separate OAuth App)
GITHUB_CLIENT_ID=Iv1.xxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxx
# Callback on GitHub must be: {BETTER_AUTH_URL}/api/auth/callback/github

GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GITHUB_APP_SLUG=your-app-slug
GITHUB_APP_WEBHOOK_SECRET=your-webhook-secret
```

Redeploy. `GET /api/github/app/status` should report configured when ID + private key
are present. GitHub login appears on `/login` when the client ID/secret are set.

#### 3. Install on the org and bind repos

1. Sign in as a workspace **owner**.
2. **Settings → workspace** → if the App is configured, use **Installer l’application**
   (or open `https://github.com/apps/<slug>/installations/new`).
3. On GitHub, choose the org/user and which repositories the App may access.
   Prefer **All repositories** so new repos created from Fluffmind are covered
   automatically. With **Only select repositories**, you must re-add each new repo
   to the installation (or re-approve access) after creation.
4. Back in Fluffmind: **Actualiser les installations** → pick installation → pick
   **one repo per workspace** → link (mode App), or use **Créer un dépôt GitHub** when
   creating a workspace.
5. For each additional workspace: create it in Fluffmind with the optional GitHub
   checkbox, use **Créer un dépôt** in Settings if linking failed, or bind an
   existing repo the same way as step 4.

After linking, collaborator sync and git push/pull use short-lived **installation
tokens** (no PAT stored for that workspace). PAT « Fallback » remains available if the
App is unset.

See also: ADR-009, PRD-033, `apps/web/AGENTS.md` (env details).

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
