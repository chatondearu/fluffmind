# P8a — Portable solo package (design)

**Date:** 2026-07-20  
**Status:** approved (product design)  
**PRD:** `prd/PRD-032-portable-solo-package.md`  
**Plan:** `plans/PLAN-032-portable-solo-package.md`  
**Scope:** portable archive with embedded Node — not a single-file exe, not desktop UI

## Problem

Self-hosters and local PKM users want Fluffmind **without Docker or Postgres**. The
app already supports solo mode (`AUTH_DISABLED`, no `DATABASE_URL`, file lock), but
the documented path still assumes `pnpm` / Compose. Non-developers need an **unzip and
run** artifact for Mac, Linux, and Windows.

## Goals

1. Ship a **portable directory archive** per OS/arch containing:
   - Embedded **Node 22 LTS** (same major as Dockerfile)
   - Nitro production output (`apps/web/.output`)
   - A **launcher** (`bin/fluffmind` / `fluffmind.cmd`)
   - Default `./vault` folder
2. Vault resolution: `--vault <path>` → env `VAULT_PATH` → `<package>/vault`
3. Require **`git` on PATH**; fail fast with a clear message if missing
4. Force solo: `AUTH_DISABLED=true`, no `DATABASE_URL`
5. Bind `127.0.0.1:3000` by default; optional `--port` / `--no-open`
6. CI releases (tag `v*` + `workflow_dispatch`) with checksums

## Non-goals (v1)

- Single executable (SEA / Bun / pkg) — future optional
- First-run folder picker UI in the browser — **follow-up (C)**
- Bundled Git binary
- Auth / Postgres inside the package
- macOS notarization / Windows Authenticode (v1.1 nice-to-have)
- Auto-update channel

## Decisions (brainstorming 2026-07-20)

| Topic | Choice |
| ----- | ------ |
| Artifact shape | Portable archive (folder), not single exe |
| Vault | CLI `--vault` / `VAULT_PATH` / package `./vault`; UI picker later |
| Git | Must be on PATH |
| Node | Embed official Node LTS in archive |
| Packaging | Homegrown script + GitHub Actions (not Electron-builder) |

## Architecture

```
User runs bin/fluffmind
        │
        ├─ resolve vault path
        ├─ check `git --version`
        ├─ export AUTH_DISABLED=true, clear DATABASE_URL
        ├─ export VAULT_PATH, HOST, PORT, WORKSPACES_ROOT (optional local)
        └─ exec runtime/node … app/.output/server/index.mjs
                │
                └─ browser open http://127.0.0.1:PORT  (unless --no-open)
```

Lock behavior: without `DATABASE_URL`, P7a uses **file lock** under the vault/workspaces
root (ADR-007). Prefer setting `WORKSPACES_ROOT` to a directory **outside** the vault
git tree when using the default package layout (e.g. `<package>/data`) so lockfiles
are never staged — or rely on existing `dirname(VAULT_PATH)/.fluffmind-locks` when
`WORKSPACES_ROOT` unset.

**Normative for portable package:** launcher sets:

- `VAULT_PATH=<resolved vault>`
- `WORKSPACES_ROOT=<package>/data` (created if missing) — keeps locks/data beside the app
- `AUTH_DISABLED=true`
- unset `DATABASE_URL`

## Archive layout

```
fluffmind-<os>-<arch>/
  bin/fluffmind            # unix shell
  bin/fluffmind.cmd        # windows
  runtime/node/            # extracted official Node binary distribution
  app/.output/             # nuxt/nitro build
  vault/                   # default empty vault (+ README)
  data/                    # WORKSPACES_ROOT / locks (not the git vault)
  README.txt
```

**Targets v1:** `darwin-arm64`, `darwin-x64`, `linux-x64`, `win-x64`.

## Launcher CLI

```
fluffmind [--vault <path>] [--port <n>] [--host <addr>] [--no-open] [--help]
```

| Flag | Default |
| ---- | ------- |
| `--vault` | `VAULT_PATH` env, else `<package>/vault` |
| `--port` | `3000` |
| `--host` | `127.0.0.1` |
| `--no-open` | open browser |

Exit codes: `0` ok, `1` missing git / bad args / node failed to start.

## Build pipeline

1. `pnpm turbo run build --filter=@fluffmind/web` (same as Docker builder)
2. Download Node 22 LTS tarball/zip for target from `nodejs.org` (pin exact version in script)
3. Assemble directory; write launchers
4. Pack: `.tar.gz` (unix), `.zip` (windows)
5. Emit `SHA256SUMS`

Script: `scripts/package-portable.mjs` (Node, runs on CI and locally).  
Workflow: `.github/workflows/release-portable.yml` on `v*` tags + manual dispatch.

## Docs & product memory

- PRD-032 / PLAN-032
- README section « Portable solo »
- Soften vision non-goal: no *native GUI app*; portable server package is in scope
- Optional ADR-008 only if we need a lasting constraint (embed Node, no Postgres in portable)

## Success metrics

- Machine with Git only (no Node, no Docker): unzip + run → editor works, note persists in vault
- No Git: clear fatal error, no hang
- No outbound Postgres connection attempts
- CI produces four artifacts + checksums

## Follow-ups

- **P8b:** browser folder picker (design decision C)
- **P8c:** optional single-exe experiment
- Codesign / notarization

## References

- Dockerfile `runner` stage (`node .output/server/index.mjs` + `apk add git`)
- ADR-003 (host `git`), ADR-007 (lock without DB)
- Epic to create under a new milestone or attach to stretch board
