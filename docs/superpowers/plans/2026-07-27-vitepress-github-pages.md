# VitePress GitHub Pages Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an English VitePress docs site in `apps/docs` and deploy it to GitHub Pages at `https://chatondearu.github.io/fluffmind/`.

**Architecture:** Add `@fluffmind/docs` as a pnpm workspace app. VitePress owns markdown under `apps/docs/` with `base: '/fluffmind/'`. A dedicated GitHub Actions workflow builds with pnpm and deploys via `actions/upload-pages-artifact` + `actions/deploy-pages`. Product content is derived from the root README (including GitHub App setup); `docs/superpowers/` stays unpublished.

**Tech Stack:** VitePress (default theme), pnpm workspaces, Turborepo, GitHub Actions Pages

**Spec:** `docs/superpowers/specs/2026-07-27-vitepress-github-pages-design.md`

## Global Constraints

- English only (no i18n v1).
- VitePress **default theme** only (no MD3 / design-system theme).
- Package lives at `apps/docs` — do **not** publish or move `docs/superpowers/`.
- `base` must be exactly `'/fluffmind/'` (leading and trailing slash).
- Dist path for CI: `apps/docs/.vitepress/dist`.
- Conventional Commits: `docs:`, `chore(docs):`, `ci:`.
- UI copy in docs: English. Code comments: English.
- Source of truth for GitHub App procedural steps: root `README.md` § GitHub App setup — keep the docs page aligned with that section.
- Explicit callout on GitHub App page: auto-creating a GitHub repo when creating a Fluffmind workspace is **not** shipped yet.

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/docs/package.json` | `@fluffmind/docs` scripts + `vitepress` dep |
| `apps/docs/.vitepress/config.mts` | `base`, title, nav, sidebar, social links |
| `apps/docs/.gitignore` | Ignore `.vitepress/dist` and `.vitepress/cache` |
| `apps/docs/index.md` | Home |
| `apps/docs/guide/getting-started.md` | Portable / dev / Docker |
| `apps/docs/guide/self-hosting.md` | Coolify + env + health |
| `apps/docs/guide/github-sync-auth.md` | OAuth vs App overview, webhooks, PAT |
| `apps/docs/guide/github-app-setup.md` | Full App create / env / install / bind guide |
| `apps/docs/guide/mcp.md` | MCP tools + stdio/HTTP |
| `apps/docs/contribute/overview.md` | Monorepo map |
| `apps/docs/contribute/dev-setup.md` | Contributor install |
| `apps/docs/contribute/architecture.md` | Short summary + link to DESIGN.md |
| `apps/docs/contribute/agent-conventions.md` | Short summary + link to AGENTS.md |
| `package.json` (root) | `docs:dev` / `docs:build` convenience scripts |
| `turbo.json` | Include VitePress dist in `build` outputs |
| `.github/workflows/docs.yml` | Build + deploy Pages |
| `README.md` | Link to live docs URL |
| `docs/superpowers/README.md` | Index the plan |

---

### Task 1: Scaffold `@fluffmind/docs` + VitePress config

**Files:**
- Create: `apps/docs/package.json`
- Create: `apps/docs/.vitepress/config.mts`
- Create: `apps/docs/.gitignore`
- Create: `apps/docs/index.md` (minimal stub so `dev`/`build` resolve)
- Modify: `package.json` (root scripts)
- Modify: `turbo.json`

**Interfaces:**
- Produces package name `@fluffmind/docs`
- Scripts: `dev` → `vitepress dev .`, `build` → `vitepress build .`, `preview` → `vitepress preview .`
- Config exports `base: '/fluffmind/'`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@fluffmind/docs",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vitepress dev .",
    "build": "vitepress build .",
    "preview": "vitepress preview ."
  },
  "devDependencies": {
    "vitepress": "^1.6.4"
  }
}
```

Use the latest VitePress 1.x available via `pnpm add -D vitepress --filter @fluffmind/docs` after creating the stub if the pin above is stale — lockfile decides.

- [ ] **Step 2: Create `.gitignore`**

```gitignore
.vitepress/dist
.vitepress/cache
```

- [ ] **Step 3: Create `.vitepress/config.mts`**

```ts
import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Fluffmind',
  description:
    'Self-hostable, git-backed PKM — markdown + wikilinks as source of truth, with a modern web UI and MCP for AI agents.',
  base: '/fluffmind/',
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Contribute', link: '/contribute/overview' },
      {
        text: 'GitHub',
        link: 'https://github.com/chatondearu/fluffmind',
      },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Self-hosting', link: '/guide/self-hosting' },
          { text: 'GitHub sync & auth', link: '/guide/github-sync-auth' },
          { text: 'GitHub App setup', link: '/guide/github-app-setup' },
          { text: 'MCP for AI agents', link: '/guide/mcp' },
        ],
      },
      {
        text: 'Contribute',
        items: [
          { text: 'Overview', link: '/contribute/overview' },
          { text: 'Dev setup', link: '/contribute/dev-setup' },
          { text: 'Architecture', link: '/contribute/architecture' },
          { text: 'Agent conventions', link: '/contribute/agent-conventions' },
        ],
      },
    ],
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/chatondearu/fluffmind',
      },
    ],
    editLink: {
      pattern:
        'https://github.com/chatondearu/fluffmind/edit/main/apps/docs/:path',
      text: 'Edit this page on GitHub',
    },
    search: {
      provider: 'local',
    },
  },
})
```

- [ ] **Step 4: Stub `index.md`**

```md
---
layout: home

hero:
  name: Fluffmind
  text: The fluffy, open-source second brain
  tagline: Self-hostable, git-backed PKM — markdown + wikilinks stay the source of truth.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: GitHub
      link: https://github.com/chatondearu/fluffmind

features:
  - title: Your files, forever
    details: Plain markdown + frontmatter in Git. Compatible with Foam/Obsidian vaults — no lock-in.
  - title: Modern web editor
    details: Notion-style block editor, built from scratch — no third-party editor framework.
  - title: Server-side Git sync
    details: One writer on the server so multi-device just works.
  - title: AI-ready (MCP)
    details: Expose your vault to agents over stdio or HTTP.
---
```

- [ ] **Step 5: Wire root scripts + turbo outputs**

In root `package.json` `scripts`, add:

```json
"docs:dev": "pnpm --filter @fluffmind/docs dev",
"docs:build": "pnpm --filter @fluffmind/docs build"
```

In `turbo.json` `build.outputs`, ensure VitePress dist is cached:

```json
"outputs": ["dist/**", ".output/**", ".nuxt/**", ".vitepress/dist/**"]
```

- [ ] **Step 6: Install and verify build**

```sh
pnpm install
pnpm --filter @fluffmind/docs build
```

Expected: exit 0; `apps/docs/.vitepress/dist/index.html` exists; asset URLs or `<base` / script `src` include `/fluffmind/` (grep the dist HTML for `/fluffmind/`).

```sh
rg -F '/fluffmind/' apps/docs/.vitepress/dist/index.html
```

Expected: at least one match.

- [ ] **Step 7: Commit**

```bash
git add apps/docs package.json turbo.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore(docs): scaffold VitePress app for GitHub Pages

Add @fluffmind/docs with base /fluffmind/ and monorepo scripts.
EOF
)"
```

---

### Task 2: Guide pages — getting started, self-hosting, MCP

**Files:**
- Create: `apps/docs/guide/getting-started.md`
- Create: `apps/docs/guide/self-hosting.md`
- Create: `apps/docs/guide/mcp.md`
- Modify: `apps/docs/index.md` only if hero needs tweak (usually no)

**Interfaces:**
- Consumes sidebar links from Task 1
- Produces routes `/guide/getting-started`, `/guide/self-hosting`, `/guide/mcp`

- [ ] **Step 1: Write `guide/getting-started.md`**

Derive from README Quick start (portable → dev → Docker). Include:

```md
# Getting started

Pick the path that matches how you want to run Fluffmind.

## Portable solo (no Docker, no Postgres)

Download a release for your OS from [Releases](https://github.com/chatondearu/fluffmind/releases)
(`fluffmind-darwin-arm64.tar.gz`, `linux-x64`, `win-x64`, …), unzip, then:

\`\`\`sh
./bin/fluffmind start
./bin/fluffmind status
./bin/fluffmind stop

./bin/fluffmind
./bin/fluffmind start --vault /path/to/notes
./bin/fluffmind start --vault /path/to/notes --readonly
./bin/fluffmind start --port 3456 --no-open
\`\`\`

Requires **Git on PATH**. Node is embedded. Auth/Postgres are disabled.
`--readonly` (or `VAULT_READONLY=true`) rejects note/folder mutations with HTTP 403.

Build from source:

\`\`\`sh
pnpm install
pnpm package:portable
pnpm portable:start
\`\`\`

## Local development

\`\`\`sh
pnpm install
VAULT_PATH=/absolute/path/to/a/markdown/vault pnpm --filter @fluffmind/web dev
\`\`\`

## Docker

\`\`\`sh
cp .env.example .env
./scripts/stack-local.sh
\`\`\`

Or `docker compose up --build` → http://localhost:3000

Next: [Self-hosting](./self-hosting) · [MCP](./mcp)
```

(Use real fenced code blocks in the file — not escaped backticks.)

- [ ] **Step 2: Write `guide/self-hosting.md`**

Include Coolify section from README: solo vs multi-account env table, OAuth callback URL, webhook URL, schema/migrations note, health check. Link to [GitHub App setup](./github-app-setup) for the optional App (do not paste the full App guide here).

- [ ] **Step 3: Write `guide/mcp.md`**

Copy tool table + stdio Cursor config + remote HTTP notes from README MCP section.

- [ ] **Step 4: Build verify**

```sh
pnpm --filter @fluffmind/docs build
```

Expected: PASS; dist contains `guide/getting-started.html` (or cleanUrls equivalent under `guide/getting-started/index.html`).

- [ ] **Step 5: Commit**

```bash
git add apps/docs/guide
git commit -m "$(cat <<'EOF'
docs: add getting started, self-hosting, and MCP guide pages

EOF
)"
```

---

### Task 3: Guide pages — GitHub sync & GitHub App setup

**Files:**
- Create: `apps/docs/guide/github-sync-auth.md`
- Create: `apps/docs/guide/github-app-setup.md`

**Interfaces:**
- Produces `/guide/github-sync-auth` and `/guide/github-app-setup`
- App setup page must mirror README § GitHub App setup (self-hosted)

- [ ] **Step 1: Write `guide/github-sync-auth.md`**

Content outline (English):

1. Two integrations table (OAuth vs GitHub App) — same as README.
2. OAuth App for login: `GITHUB_CLIENT_ID` / `SECRET`, callback `{BETTER_AUTH_URL}/api/auth/callback/github`.
3. Optional GitHub App for repo access — link to [GitHub App setup](./github-app-setup).
4. Webhooks: `POST {BETTER_AUTH_URL}/api/webhooks/github`.
5. PAT fallback when App unset.
6. Callout: today Fluffmind **links** an existing repo; auto-create on workspace create is **not** shipped.

- [ ] **Step 2: Write `guide/github-app-setup.md`**

Port the full README section **GitHub App setup (self-hosted)** into this page (create App steps, permissions table, env block, install + bind steps). Keep French UI labels from the product (`Installer l’application`, `Actualiser les installations`) as they appear in the app. Keep the blockquote that auto-creating repos is not shipped. End with links to ADR-009 / PRD-033 on GitHub:

- `https://github.com/chatondearu/fluffmind/blob/main/foam/decisions/ADR-009-github-app-installations.md`
- `https://github.com/chatondearu/fluffmind/blob/main/prd/PRD-033-github-app-installations.md`

- [ ] **Step 3: Build verify**

```sh
pnpm --filter @fluffmind/docs build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/guide/github-sync-auth.md apps/docs/guide/github-app-setup.md
git commit -m "$(cat <<'EOF'
docs: add GitHub sync and GitHub App setup guides

EOF
)"
```

---

### Task 4: Contribute pages

**Files:**
- Create: `apps/docs/contribute/overview.md`
- Create: `apps/docs/contribute/dev-setup.md`
- Create: `apps/docs/contribute/architecture.md`
- Create: `apps/docs/contribute/agent-conventions.md`

**Interfaces:**
- Produces `/contribute/*` routes
- External links to raw GitHub `DESIGN.md` / `AGENTS.md` (do not duplicate full docs)

- [ ] **Step 1: Write `contribute/overview.md`**

```md
# Contribute

Fluffmind is a pnpm + Turborepo monorepo.

| Path | Role |
| ---- | ---- |
| `apps/web` | Nuxt app (UI + Nitro) |
| `apps/docs` | This VitePress site |
| `packages/design-system` | Reka UI + UnoCSS + MD3 tokens |
| `packages/editor-blocks` | Custom block editor |
| `packages/integrations` | Git plumbing, GitHub, MCP helpers |
| `packages/db` | Drizzle schema + Better Auth |

Product memory for humans/agents lives under `foam/`, `prd/`, and `plans/` — not on this site.

Start with [Dev setup](./dev-setup), then [Architecture](./architecture).
```

- [ ] **Step 2: Write `contribute/dev-setup.md`**

```md
# Dev setup

\`\`\`sh
pnpm install
VAULT_PATH=/absolute/path/to/a/markdown/vault pnpm --filter @fluffmind/web dev
\`\`\`

Useful root scripts: `pnpm lint`, `pnpm typecheck`, `pnpm docs:dev`.

Point `VAULT_PATH` at any Foam/Obsidian-style markdown folder. See root `AGENTS.md` for env vars (`AUTH_DISABLED`, `WORKSPACES_ROOT`, GitHub App keys, etc.).
```

- [ ] **Step 3: Write `contribute/architecture.md`**

Short founding principle (markdown + Git = source of truth; Postgres never stores note content; server is sole Git writer). Link:

`https://github.com/chatondearu/fluffmind/blob/main/DESIGN.md`

- [ ] **Step 4: Write `contribute/agent-conventions.md`**

Note that agents should read closest `AGENTS.md`; import-extension gotcha (packages vs `apps/web`); link:

`https://github.com/chatondearu/fluffmind/blob/main/AGENTS.md`

- [ ] **Step 5: Build verify**

```sh
pnpm --filter @fluffmind/docs build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/docs/contribute
git commit -m "$(cat <<'EOF'
docs: add contributor overview and setup pages

EOF
)"
```

---

### Task 5: GitHub Actions workflow for Pages

**Files:**
- Create: `.github/workflows/docs.yml`

**Interfaces:**
- Triggers: `push` to `main`, `workflow_dispatch`
- Permissions: `contents: read`, `pages: write`, `id-token: write`
- Artifact path: `apps/docs/.vitepress/dist`

- [ ] **Step 1: Create workflow**

```yaml
name: Deploy docs to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: pnpm

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Cache VitePress
        uses: actions/cache@v4
        with:
          path: apps/docs/.vitepress/cache
          key: ${{ runner.os }}-vitepress-${{ hashFiles('apps/docs/**', 'pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-vitepress-

      - name: Build docs
        run: pnpm --filter @fluffmind/docs build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: apps/docs/.vitepress/dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    needs: build
    runs-on: ubuntu-latest
    name: Deploy
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

Align `actions/checkout` / `setup-node` major versions with other workflows in the repo if they differ (prefer consistency with `release-portable.yml` where reasonable; Pages-specific actions follow VitePress guide).

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/docs.yml
git commit -m "$(cat <<'EOF'
ci: deploy VitePress docs to GitHub Pages

EOF
)"
```

---

### Task 6: Surface links + operator Pages enablement

**Files:**
- Modify: `README.md` (top link row)
- Modify: `docs/superpowers/README.md` (plan index row)
- GitHub API: set homepage URL

**Interfaces:**
- Homepage: `https://chatondearu.github.io/fluffmind/`
- README links to that URL as **Docs**

- [ ] **Step 1: Update README top links**

Change the link row under the hero to:

```md
[Docs](https://chatondearu.github.io/fluffmind/) · [Project board](https://github.com/users/chatondearu/projects/3) · [Milestones](https://github.com/chatondearu/fluffmind/milestones) · [Releases](https://github.com/chatondearu/fluffmind/releases)
```

Optionally add under Self-hosting / GitHub App a short “See also: Docs → GitHub App setup” link pointing at `https://chatondearu.github.io/fluffmind/guide/github-app-setup`.

- [ ] **Step 2: Set GitHub homepage**

```sh
gh repo edit chatondearu/fluffmind --homepage "https://chatondearu.github.io/fluffmind/"
```

- [ ] **Step 3: Index the plan in `docs/superpowers/README.md`**

Add a row for `plans/2026-07-27-vitepress-github-pages.md` next to the matching spec.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/README.md
git commit -m "$(cat <<'EOF'
docs: link README and homepage to the VitePress docs site

EOF
)"
```

- [ ] **Step 5: Operator checklist (manual, not code)**

After merging/pushing to `main`:

1. GitHub → **Settings → Pages → Build and deployment → Source = GitHub Actions**
2. Confirm the `Deploy docs to GitHub Pages` workflow is green
3. Open `https://chatondearu.github.io/fluffmind/` and spot-check Guide + Contribute nav, and that CSS/JS load (no 404s under `/fluffmind/assets/…`)
4. Open `/guide/github-app-setup` and confirm the auto-create-not-shipped callout is visible

---

## Spec coverage (self-review)

| Spec requirement | Task |
| ---------------- | ---- |
| `apps/docs` VitePress package | Task 1 |
| English, default theme | Tasks 1–4 |
| `base: '/fluffmind/'` | Task 1 |
| Guide pages incl. GitHub App setup | Tasks 2–3 |
| Contribute pages + DESIGN/AGENTS links | Task 4 |
| Do not publish `docs/superpowers/` | Task 1/5 artifact path |
| CI deploy Actions → Pages | Task 5 |
| README + homepage link | Task 6 |
| Auto-create repo not shipped callout | Task 3 |

No TBD/placeholder steps remain after this review.
