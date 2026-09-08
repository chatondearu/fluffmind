# Workspace create: link existing GitHub App repo — Design

**Date:** 2026-09-08  
**Related:** [[../../../prd/PRD-034-github-repo-on-workspace-create|PRD-034]] (create-repo at create), [[../../../foam/decisions/ADR-009-github-app-installations|ADR-009]]  
**Delivery:** UI-first in `WorkspaceCreateDialog`; reuse existing APIs (no new routes)

## Problem

At workspace creation, owners can optionally **create** a new GitHub repository
(PRD-034). Linking an **existing** App-installation repository is only available
later in Settings (`WorkspaceGitHubSection` → `POST /api/workspaces/github/link`).
Operators who already have a vault repo must create a local workspace then leave
the dialog to bind GitHub — friction for the common “import existing repo” case.

## Goals

- In `WorkspaceCreateDialog`, when GitHub App + ≥1 installation are available,
  offer three modes: **create new repo**, **link existing repo**, **no GitHub**
- Link-existing uses App install + repo picker (same data as Settings)
- Soft-fail: workspace remains if link fails after create; surface a warning
- Preserve current create-repo and local-only behaviors

## Non-goals

- PAT linking in the create dialog (Settings only for v1)
- Linking into a non-empty pre-seeded vault from create (new workspace vault starts empty → clone)
- New backend routes or changing `ensureWorkingCopy` / clone semantics
- Changing 1 workspace ↔ 1 repo (ADR-009)
- Onboarding auto-path GitHub choices

## Current link semantics (unchanged)

`POST /api/workspaces/github/link` binds **one** workspace id, refuses if already
linked (409), sets `gitRemoteUrl`, invalidates bootstrap. Next vault access on an
**empty** working copy clones the remote into that workspace path. Other
workspaces are unaffected. Linking does not “replace” another workspace’s link.

## Decisions

| Topic | Choice |
| ----- | ------ |
| Approach | Create workspace, then call existing link API (client two-step) |
| GitHub modes in dialog | Create repo / Link existing / None |
| Auth for link | Creator is owner → `requireWorkspaceManageAuthority` passes |
| Soft-fail | Same pattern as create-repo: keep org, `githubWarning` on `created` |
| PAT | Out of create dialog |

## UI

`WorkspaceCreateDialog.vue`:

1. When App configured and installations loaded: show a mode control (radio or
   equivalent) instead of a lone “Créer un dépôt” checkbox.
2. **Create repo** — current fields (installation, name, private).
3. **Link existing** — installation select → load
   `GET /api/github/installations/:installationId/repos` → repo select
   (`owner/repo`). Optional content roots (same as today).
4. **None** — name (+ optional content roots) only.
5. French copy; loading / empty / error states for repo list.

## Client sequence (link existing)

1. `POST /api/workspaces` with `{ name, contentRoots? }` — **no** `createGithubRepo`.
2. `POST /api/workspaces/github/link` with
   `{ workspaceId, mode: 'app', installationId, repository, contentRoots? }`.
3. On link failure: emit `created` with `organizationId` + `githubWarning`
   (workspace already exists).
4. On full success: emit `created` without warning; close dialog.
5. Active-workspace switch stays as today’s `created` handler in `app.vue`.

## APIs (reuse only)

| Method | Path | Role |
| ------ | ---- | ---- |
| GET | `/api/github/installations` | List installs (already used by dialog) |
| GET | `/api/github/installations/:id/repos` | Repo picker |
| POST | `/api/workspaces` | Create org + vault config |
| POST | `/api/workspaces/github/link` | Bind existing repo |

No schema migration.

## Testing & verification

- Manual: create + link existing App repo → vault shows remote notes after open
- Manual: create + link fail (bad install) → workspace exists + warning
- Manual: create-repo and no-GitHub modes still work
- Typecheck / lint green for touched Vue file(s)

## Docs

- Short note in `apps/docs/guide/github-sync-auth.md` and/or self-hosting:
  at create, create **or** link existing App repo.
- Optional: extend PRD-034 goals or add a thin PRD-042 pointer — implementation
  may ship with this design + PLAN under `docs/superpowers/` first.

## Out of this change

- Server-side atomic create+link endpoint
- Admin create dialog parity (unless it reuses the same component)
- Changing clone / empty-dir behavior
