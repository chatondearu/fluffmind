# Public docs site — VitePress on GitHub Pages (design)

**Date:** 2026-07-27  
**Status:** approved (product design)  
**Scope:** public documentation site for users + contributors, published via GitHub Pages

## Problem

The repo has strong internal memory (`foam/`, `prd/`, `DESIGN.md`, `AGENTS.md`,
`docs/superpowers/`) and a polished README, but **no public documentation site**.
GitHub Pages is unset. New visitors and self-hosters only get a single README scroll;
contributors lack a curated entry point that is separate from agent session archives.

## Goals

1. Ship an English **VitePress** docs site under `apps/docs` (`@fluffmind/docs`).
2. Cover **both** audiences: end users / self-hosters **and** contributors.
3. Deploy automatically to **GitHub Pages** at
   `https://chatondearu.github.io/fluffmind/` (`base: '/fluffmind/'`).
4. Link the site from the GitHub repo homepage and the README.
5. Keep `foam/`, `prd/`, and `docs/superpowers/` **out of the public site** (project
   memory / agent archive, not product docs).

## Non-goals (v1)

- French i18n (English only for v1)
- Custom Material Design 3 / design-system theme (use VitePress default theme)
- Algolia / full-text hosted search
- Dumping or mirroring `foam/` / ADRs / PRDs into the site
- Custom domain
- Publishing via `gh-pages` branch (use GitHub Actions + Pages artifact instead)

## Decisions (brainstorming 2026-07-27)

| Topic | Choice |
| ----- | ------ |
| Audience | Users + contributors (option C) |
| Tool | VitePress (option A) |
| Language | English only (option A) |
| Location | `apps/docs` — avoids colliding with `docs/superpowers/` |
| Deploy | GitHub Actions → GitHub Pages (`actions/deploy-pages`) |
| Theme | VitePress default |

## Architecture

```
apps/docs/                    VitePress package (@fluffmind/docs)
  .vitepress/config.ts        base: '/fluffmind/', nav, sidebar
  index.md                    Home
  guide/                      User / operator docs
  contribute/                 Contributor docs (pointers to DESIGN/AGENTS)
.github/workflows/docs.yml    build + deploy Pages
docs/superpowers/             unchanged (agent archive, not published)
```

CI flow:

1. Push to `main` (or `workflow_dispatch`)
2. pnpm install → `pnpm --filter @fluffmind/docs build`
3. Upload `apps/docs/.vitepress/dist` as Pages artifact
4. `actions/deploy-pages` publishes the site

One-time operator step: repo **Settings → Pages → Source = GitHub Actions**.

## Content map (v1)

### Guide

| Page | Purpose |
| ---- | ------- |
| Home | Tagline, what Fluffmind is, CTAs (get started / GitHub) |
| Getting started | Portable solo, local `pnpm` dev, Docker |
| Self-hosting | Coolify compose, core env vars, health check |
| GitHub sync & auth | OAuth App, optional GitHub App, webhooks (from README) |
| MCP for AI agents | stdio + HTTP, tool table, Cursor example |

### Contribute

| Page | Purpose |
| ---- | ------- |
| Overview | Monorepo map, how to navigate the repo |
| Dev setup | install, `VAULT_PATH`, useful scripts |
| Architecture | Short summary + link to `DESIGN.md` on GitHub |
| Agent conventions | Short summary + link to `AGENTS.md` on GitHub |

Content is **derived from the README** (and lightly from `DESIGN.md` / vision), rewritten
for scannability — not a verbatim paste of milestone jargon.

## Integration with the monorepo

- Add `@fluffmind/docs` under `apps/*` (already covered by `pnpm-workspace.yaml`).
- Turbo: `build` outputs include VitePress dist (e.g. `apps/docs/.vitepress/dist/**`).
- Root optional convenience script: `docs:dev` / `docs:build` filtering the package.
- Do **not** move or publish `docs/superpowers/`.

## Repo surface updates

- GitHub homepage URL → `https://chatondearu.github.io/fluffmind/`
- README: link to the docs site near the top (with board / milestones / releases)
- Topics already set; no change required for Pages

## Risks & mitigations

| Risk | Mitigation |
| ---- | ---------- |
| `base` path wrong → broken assets | Set `base: '/fluffmind/'`; verify on first Pages deploy |
| Docs drift from README | Prefer docs as user-facing source; keep README as short entry + deep-link |
| Pages not enabled | Document Settings → Source = Actions in the plan checklist |
| Accidental publish of agent specs | Site rooted at `apps/docs` only; workflow artifact path scoped |

## Success criteria

1. `pnpm --filter @fluffmind/docs build` succeeds locally.
2. Push to `main` deploys a working site at `/fluffmind/` with Guide + Contribute nav.
3. GitHub homepage and README point at the live docs URL.
4. `docs/superpowers/` remains unpublished and path-stable.
