# Admin GitHub App panel — Design

**Date:** 2026-07-31  
**PRD:** [[../../../prd/PRD-040-admin-github-panel|PRD-040]]  
**ADR:** [[../../../foam/decisions/ADR-014-admin-github-panel|ADR-014]]

## Problem

Instance admins can recover workspaces (PRD-039) but have no inventory of
**GitHub App installations** recorded on the instance. After deleting a
workspace or unlinking sync, operators often believe the App itself was lost —
even though installations are instance-scoped (ADR-009) and unrelated to a
single workspace delete. There is also no safe UI to resync a stale installation
row, unlink all workspaces for one installation, or remove an orphan DB row
without waiting for a GitHub `installation.deleted` webhook.

## Goals

- Instance admin can see App env/status and all DB installations with linked workspaces
- Recovery actions: resync from GitHub API, unlink-all workspaces, remove installation from DB
- Same admin surface as PRD-039: third panel on `/settings/admin`
- Dedicated `/api/admin/github/*` routes gated by `requireAdminInstance`

## Non-goals (v1)

- Uninstalling the App on GitHub via API
- Bulk collaborator sync / PAT management / invitation inbox
- Dedicated `/settings/admin/github` route
- Changing ADR-009 binding model (1 installation → N workspaces)

## Decisions

| Topic | Choice |
| ----- | ------ |
| Who | Instance admin only |
| Where | `/settings/admin` — Users + Workspaces + **GitHub** |
| Scope | Status + installations inventory + resync + unlink-all + remove-from-DB + install URL |
| Confirm | Type `installationId` for unlink-all and delete-from-DB; none for resync |
| Approach | New admin API; reuse `fetchGitHubAppStatus`, `fetchInstallationAccount`, `upsertGithubAppInstallation`, `removeGithubAppInstallation` |

## UI

Extend `apps/web/app/pages/settings/admin.vue`:

1. **App status card** — configured / slug / webhook / OAuth login chips; permission summary from `fetchGitHubAppStatus`; « Installer l'App » when install URL available
2. **Installations list** — account login/type, installation id, timestamps; nested linked workspaces (name, slug, org id, owner/repo)
3. **Actions (French)** — « Resynchroniser », « Unlink tous les workspaces », « Retirer de la DB »
4. Empty states when App not configured or no installations

Confirm via `window.prompt` (same v1 pattern as workspace danger panel).

## APIs

| Method | Path | Body / notes |
| ------ | ---- | ------------ |
| GET | `/api/admin/github` | `{ appStatus, installations: [{ …, linkedWorkspaces }], installUrl }` |
| POST | `/api/admin/github/installations/:installationId/resync` | Upsert account from GitHub; 404 if GitHub unknown |
| POST | `/api/admin/github/installations/:installationId/unlink-workspaces` | `{ confirmInstallationId }` — clear links + `gitRemoteUrl`; keep installation row |
| DELETE | `/api/admin/github/installations/:installationId` | `{ confirmInstallationId }` — `removeGithubAppInstallation` (DB only, no GitHub uninstall) |

All routes call `requireAdminInstance` first.

### Error mapping

| Case | statusCode | statusMessage |
| ---- | ---------- | ------------- |
| Confirm mismatch | 400 | `Confirmation mismatch` |
| Installation missing in DB | 404 | `Installation not found` |
| Installation missing on GitHub (resync) | 404 | `Installation not found` |
| App credentials / GitHub API failure | 502 | `GitHub App request failed` (or auth-style message) |

ASCII-only `statusMessage`; detail in `message`.

## Data / helpers

No schema migration. New helper (e.g. `admin-github.ts`) to:

- Join `github_app_installation` ↔ `workspace_github_link` ↔ `organization` / `workspace_config`
- Assert `confirmInstallationId`
- Orchestrate unlink-all without deleting the installation row

Reuse existing installation utils; do not duplicate token minting.

## Edge cases

- Workspace delete (PRD-039) already leaves `github_app_installation` intact — this panel makes that visible
- Resync of a GitHub-deleted installation → 404; admin may then « Retirer de la DB »
- Remove-from-DB matches webhook `installation.deleted` local cleanup semantics
- Never delete remote GitHub repositories
- Never mutate env credentials from the UI

## Testing

- Unit: list with linked workspaces; confirm mismatch; unlink-all keeps installation; remove calls through existing util
- Typecheck `@fluffmind/web`
- Manual smoke on `/settings/admin` as instance admin

## Out of scope follow-ups

- Admin page for pending GitHub invitations
- Live list of GitHub installations not yet in DB (discover via `/app/installations`)
- Dedicated admin GitHub route if the panel grows too dense
