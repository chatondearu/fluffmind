# Instance admin dangerous workspace ops — design

**Date:** 2026-07-31  
**PRD:** [[../../../prd/PRD-039-admin-dangerous-workspace-ops|PRD-039]]  
**ADR:** [[../../../foam/decisions/ADR-013-admin-dangerous-workspace-ops|ADR-013]]

## Problem

Staging/ops incidents (divergent Git working copy, broken sync, “lost” workspace
context) leave instance operators without a safe UI to recover. Today only owner-level
GitHub unlink exists; there is no hard reset to `origin/<branch>`, no instance-wide
workspace inventory, no orphan-folder rebind, and no admin delete of a workspace.

## Goals

- Instance **admin** (`user.role === admin`) can list all workspaces and recover them
- Dangerous actions behind confirmations (slug type-back for destructive ops)
- Single admin surface: extend `/settings/admin`

## Non-goals (v1)

- Workspace **owner** access to these actions
- Deleting the remote GitHub repository
- Reset to an arbitrary branch other than stored `gitBranch`
- Bulk multi-select operations
- Changing Better Auth’s organization plugin internals beyond delete/list usage

## Decisions

| Topic | Choice |
| ----- | ------ |
| Who | Instance admin only (`requireAdminInstance`) |
| Where | `/settings/admin` — Users + Workspaces panels |
| Scope | List, orphans, reset-hard, invalidate index, force unlink, delete, rebind orphan |
| Confirm | Type slug for reset-hard / delete / rebind; simple confirm for unlink / invalidate |

## UI

Extend existing `apps/web/app/pages/settings/admin.vue`:

1. **Workspaces table** — id, name, slug, vault path exists?, GitHub link, branch,
   optional ahead/behind (best-effort; omit on git errors)
2. **Orphans list** — directory names under `WORKSPACES_ROOT` with no matching
   `workspace_config.organizationId`
3. **Row actions** — buttons with French labels, danger styling for destructive ops
4. **Confirm dialog** — input must equal workspace slug (or folder name for rebind)

Non-admins keep current 403 behavior if they hit the page/APIs.

## APIs

All routes call `requireAdminInstance` first.

| Method | Path | Body / notes |
| ------ | ---- | ------------ |
| GET | `/api/admin/workspaces` | `{ workspaces[], orphans[] }` |
| POST | `/api/admin/workspaces/:id/reset-hard` | `{ confirmSlug }` — fetch + `reset --hard origin/<gitBranch>` under workspace lock; invalidate index |
| POST | `/api/admin/workspaces/:id/invalidate-index` | Drop cached vault index |
| POST | `/api/admin/workspaces/:id/unlink-github` | Reuse unlink semantics (clear link + `gitRemoteUrl`); disk untouched |
| DELETE | `/api/admin/workspaces/:id` | `{ confirmSlug }` — cascade local metadata then org delete then `rm` vault dir |
| POST | `/api/admin/workspaces/rebind` | `{ organizationId, folderName, confirmSlug }` — folder must be inside `WORKSPACES_ROOT`, no `..` |

### Reset-hard details

- Resolve `workspace_config` path + branch + credentials
- Acquire workspace write lock
- `ensureWorkingCopy` / fetch `origin`
- `git reset --hard origin/<branch>`
- Invalidate index; return sync status snippet
- No remote = 400; auth failure = 502; conflict/missing ref = 409

### Delete cascade (order)

1. Verify `confirmSlug` matches organization slug  
2. Delete agent/MCP tokens for org  
3. Delete `workspace_github_link`, invitation rows, member sync meta as needed  
4. Delete `workspace_config`  
5. Delete Better Auth organization (members cascade per BA)  
6. `rm` vault directory if still under `WORKSPACES_ROOT`  
7. Clear active-workspace cookie if it pointed at deleted id (best-effort)

### Rebind

- `folderName` is a single path segment (org id folder name today)
- Target org must exist; prefer empty/missing vault or allow overwrite only if dest empty
- Set `workspace_config.vaultPath` to resolved absolute path; mkdir if needed

## Errors

| Case | Status | statusMessage |
| ---- | ------ | ------------- |
| Not admin | 403 | Forbidden |
| Unknown workspace | 404 | Workspace not found |
| Slug mismatch | 400 | Confirmation mismatch |
| Path escape | 400 | Invalid path |
| No remote for reset | 400 | No git remote |
| Git auth | 502 | Git authentication failed |
| Git conflict / missing ref | 409 | Conflict |

## Testing

- Admin gate on new routes
- `confirmSlug` reject/accept
- Reset path stays within `WORKSPACES_ROOT`
- Rebind rejects `..` / absolute folderName
- Delete removes config row (integration or mocked cascade)
- Non-admin 403

## Follow-ups

- Owner-facing “repair sync” soft actions (non-hard)
- Audit log of admin dangerous actions
- Reset to arbitrary ref

## References

- `apps/web/server/utils/admin.ts`, `apps/web/app/pages/settings/admin.vue`
- ADR-002 (server-side Git), ADR-006 (workspaces)
- Recent staging: divergent `git pull` without rebase (fixed separately)
