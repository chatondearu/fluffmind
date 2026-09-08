# Admin workspace management console — Design

**Date:** 2026-09-08  
**PRD:** [[../../../prd/PRD-041-admin-workspace-management|PRD-041]]  
**ADR:** [[../../../foam/decisions/ADR-015-instance-admin-workspace-authority|ADR-015]]  
**Plan:** [[../../../plans/PLAN-041-admin-workspace-management|PLAN-041]]  
**Delivery:** single PR, backend-first commit order

## Problem

Instance admins can list every workspace on `/settings/admin` but can only run
**destructive** recovery (reset-hard, unlink, delete, rebind). Configuration that
makes a workspace usable — members & invitations, GitHub link/sync, content roots,
MCP/agent tokens — is gated by duplicated local `requireOwnerRole` helpers that only
ever act on the caller's **active** workspace cookie. An admin who provisions
workspaces for a team must join each one as owner and switch into it. There is no
single place to answer "who can access workspace X?" or to administer a workspace
the admin does not belong to.

## Goals

- Instance admin can fully manage **any** workspace without membership
- Unified admin console at `/settings/admin/workspaces/[id]`
- Management endpoints target a workspace by **explicit id** (owners and admins)
- Shared `requireWorkspaceManageAuthority` replaces duplicated owner helpers
- Admin cross-workspace mutations audit-logged in `admin_audit`
- Accessible confirmation modal replaces `window.prompt` on the admin surface
- Read-only instance-wide "workspace → members" overview

## Non-goals

- Self-serve browse/join of workspaces by non-invited users
- New Better Auth role hierarchy (admin authority is an app-level override)
- Changing note read/write scoping or single-writer vault guarantees
- Multi-step create → link → invite wizard
- Deleting GitHub remote repositories
- Audit history UI (writes only in this PR)
- Cross-workspace member *editing* from the overview (read-only first)

## Decisions

| Topic | Choice |
| ----- | ------ |
| Delivery | One PR (`feat/admin-workspace-management`); backend-first commits |
| Authority | `requireWorkspaceManageAuthority(event, workspaceId)` → admin **or** owner of that id |
| Targeting | Explicit `workspaceId` for all management callers; cookie is not authority |
| Audit | New `admin_audit` table; write only when `actor === 'admin'` |
| UI route | Dedicated `/settings/admin/workspaces/[id]` (not inline expansion) |
| Confirm | `ConfirmActionDialog` (name/slug echo), not `window.prompt` |
| Overview | Read-only members map on `/settings/admin` |

## Architecture — authority & API

### Guard

```ts
requireWorkspaceManageAuthority(event, workspaceId)
  → { workspaceId, actor: 'admin' | 'owner' } | 403
```

1. Resolve session.
2. If `requireAdminInstance` would pass → `{ actor: 'admin' }`.
3. Else if caller is an `owner` member of `workspaceId` → `{ actor: 'owner' }`.
4. Else 403.

`auditAdminAction(actor, …)` no-ops for `actor === 'owner'`.

### Endpoint migration

Replace local `requireOwnerRole` / `requireOwnerSession` (8 copies today) and align
routes that used `requireWorkspaceManage` (Better Auth permission on the **active**
org) so admin + owner share one rule:

| Group | Endpoints |
| ----- | --------- |
| GitHub | `link` / `link.delete` / `create-and-link` / `sync` / `invite-candidates` |
| Agent | `agent` get/patch, `tokens` post/delete |
| Invitations | `invitations` get/post (today: `requireWorkspaceManage` + active cookie) |

**Content roots** are not a separate route — they ship on `link` / `create-and-link`
bodies; migrating those handlers covers them.

**Members list / role / remove** today go through Better Auth client APIs scoped to
the **active** organization (`listMembers`, etc.). For the admin console and the
read-only overview, add thin **id-scoped** app endpoints (guarded by
`requireWorkspaceManageAuthority` or `requireAdminInstance` for the overview) so
admins do not need `setActive` on a foreign workspace. Owner UI may keep BA client
calls for its active workspace, or switch to the same id-scoped endpoints for one
code path — prefer one code path when extracting components.

Each migrated handler takes explicit `workspaceId` (path segment or body). Owner UI
passes the active workspace id explicitly — behavior unchanged for owners.

**Unchanged:** note vault APIs; existing `/api/admin/**` danger-zone routes (still
`requireAdminInstance` only); `invitations/[id]/accept` (invitee flow).

## Data — `admin_audit`

Drizzle migration (next after `0006`):

| Column | Notes |
| ------ | ----- |
| `id` | primary key |
| `actorUserId` | admin user id |
| `actor` | `'admin'` \| `'owner'` (writes are admin in practice) |
| `action` | stable string, e.g. `workspace.github.link` |
| `targetWorkspaceId` | organization / workspace id |
| `detail` | optional jsonb |
| `createdAt` | timestamp |

Helper: `insertAdminAudit` in `packages/db`. No read UI in this PR.

## UI

1. Extract from `workspace.vue` into `workspaceId`-parameterized components:
   Members, GitHubSync (incl. content roots), Tokens/Agents.
2. Owner `/settings/workspace` composes them with the active id (no functional change).
3. New `pages/settings/admin/workspaces/[id].vue` composes the same + danger zone.
4. `/settings/admin` links each workspace row to the new route; adds read-only
   workspace → members overview.
5. New `ConfirmActionDialog` (pattern from existing `ConfirmDialog` / `PromptDialog`)
   replaces `window.prompt` in the admin surface for reset-hard / delete / unlink.

Admin console page is instance-admin only; sections work without workspace membership.

## Implementation order (backend-first)

1. `admin_audit` schema + migration + `insertAdminAudit`
2. `requireWorkspaceManageAuthority` + `auditAdminAction` + unit tests
3. Migrate endpoint groups (GitHub → agent/tokens → invitations)
4. Add id-scoped members list (and role/remove if needed for console) endpoints
5. Remove duplicated local owner helpers
6. Extract owner settings components (single fetch path parameterized by `workspaceId`)
7. Admin workspace page + danger zone wiring
8. `ConfirmActionDialog` + admin prompt removal
9. Read-only members overview (admin-only aggregate or per-workspace fetch)
10. Docs touch-up; ADR-015 → accepted; PRD goals checked when shipped

## Testing & verification

- Guard: admin any-id OK; owner only-owned OK; others 403
- Each migrated endpoint group: owner / admin / non-member
- `admin_audit` row on admin mutation; none on owner mutation
- Read-only overview admin-only
- CI: lint / typecheck / test / build green
- Manual: admin links GitHub + invites a member on a workspace they do not belong to

## Error handling

- Non-admin, non-owner → 403 (ASCII `statusMessage`)
- Missing / unknown `workspaceId` → 404 where applicable
- Paths must not escape `WORKSPACES_ROOT` (existing ADR-013 constraints on danger ops)
- Confirmation mismatch on destructive dialog → 400 / client-side block

## Out of this PR (deferred)

- Create → link → invite wizard
- Audit log viewer
- Overview-driven member editing
- Inline markdown escaping and other review nits unrelated to admin console
