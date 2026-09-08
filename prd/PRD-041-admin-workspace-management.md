# PRD-041 — Admin workspace management console

- **Status**: shipped
- **Shipped**: 2026-09-08
- **Date**: 2026-09-07
- **Tags**: #product #admin #workspaces #authz
- **Depends on**: [[PRD-039-admin-dangerous-workspace-ops|PRD-039]], [[PRD-040-admin-github-panel|PRD-040]], [[PRD-035-auth-production-ready|PRD-035]]
- **ADR**: [[../foam/decisions/ADR-015-instance-admin-workspace-authority|ADR-015]] (accepted)

## Problem

Managing workspaces on a self-hosted instance is fragmented and unintuitive. Instance
admins can see every workspace on `/settings/admin` but can only run **destructive**
recovery actions (reset-hard, unlink, delete, rebind). Everything that makes a workspace
*usable* — members & invitations, GitHub link/sync, content roots, MCP/agent tokens — is
gated behind **workspace owner** membership and only ever operates on the caller's
**active** workspace. So an admin who provisions workspaces for a team must, per
workspace: create it, invite themselves as owner, switch into it, then link GitHub and
invite members — across three disjoint surfaces. There is no single place to answer "who
can access workspace X?" or to administer a workspace the admin doesn't belong to.

## Goals

- [x] An instance admin can fully manage **any** workspace without being a member
      (authority model: [[../foam/decisions/ADR-015-instance-admin-workspace-authority|ADR-015]])
- [x] A unified admin console: per-workspace **Members**, **GitHub sync**, **Content
      roots**, **Tokens**, and existing danger-zone ops, reachable from one place
- [x] Management endpoints target a workspace by **id** (not only the active one)
- [x] Replace `window.prompt(slug)` destructive confirmations with an accessible modal
- [x] A single shared `requireWorkspaceManageAuthority` guard replaces the duplicated
      `requireOwnerRole` helpers, with admin cross-workspace writes audit-logged

## Non-goals

- Self-serve "browse & join" of arbitrary workspaces by non-invited users
- A new Better Auth role hierarchy (admin authority is an app-level override — ADR-015)
- Changing note read/write scoping or the single-writer vault guarantees
- Multi-step "create → link → invite" wizard (tracked separately; this PRD unifies the
  *management* surface, not the create flow)
- Deleting GitHub remote repositories

## Users & scenarios

| Persona | Scenario |
| ------- | -------- |
| Instance admin | Provisions "Acme" for a team, links its GitHub repo and invites 3 members — all from the admin console, without joining the workspace |
| Instance admin | Audits "who has access to workspace X" and demotes a stale owner, on a workspace they are not a member of |
| Instance admin | Deletes a broken workspace via a confirmation modal (no slug copy-paste) |
| Workspace owner (non-admin) | Manages only their own workspace via `/settings/workspace`, unchanged; cannot reach other workspaces (403) |

## Requirements

### Functional

- [x] `requireWorkspaceManageAuthority(event, workspaceId)` → passes for instance admin
      OR owner-of-workspace; returns `{ workspaceId, actor: 'admin' | 'owner' }`
- [x] Migrate `api/workspaces/**` management endpoints to accept an explicit
      `workspaceId` (uniform for owners and admins) and use the shared guard (members,
      invitations, GitHub link/unlink/sync, content roots, agent/MCP tokens, agent enable)
- [x] Admin console route `/settings/admin/workspaces/[id]` reusing the owner settings
      components (Members, GitHub sync, Content roots, Tokens) + danger zone
- [x] New `admin_audit` table + write on every admin cross-workspace mutation
- [x] Accessible confirmation modal for reset-hard / delete / unlink (replaces
      `window.prompt`), showing workspace name + impact
- [x] Instance-wide "workspace → members" **read-only** view for admins

### Non-functional

- [x] Non-admin, non-owner callers still receive 403 on every migrated endpoint
- [x] Admin cross-workspace mutations are audit-logged (actor id + `actor='admin'`)
- [x] ASCII `statusMessage` on errors; paths cannot escape `WORKSPACES_ROOT`
- [x] No regression in owner `/settings/workspace` behavior or in existing tests

## Related project memory

- ADRs: [[../foam/decisions/ADR-015-instance-admin-workspace-authority|ADR-015]], [[../foam/decisions/ADR-013-admin-dangerous-workspace-ops|ADR-013]], [[../foam/decisions/ADR-014-admin-github-panel|ADR-014]], [[../foam/decisions/ADR-006-better-auth-workspaces|ADR-006]]
- Code: `apps/web/app/pages/settings/admin.vue`, `apps/web/app/pages/settings/workspace.vue`, `apps/web/server/api/workspaces/**`, `apps/web/server/utils/admin.ts`

## Resolved decisions

1. **Route per workspace** — the console is a dedicated admin route
   `/settings/admin/workspaces/[id]` (not inline row expansion), so deep-links and
   navigation are clean.
2. **Uniform API** — management endpoints take an explicit `workspaceId` for **all**
   callers (owners and admins alike); the active-workspace cookie is no longer implicit
   authority. Owner UI passes the active id explicitly.
3. **New `admin_audit` table** — admin cross-workspace mutations are recorded in a
   dedicated `admin_audit` table (actor id, `actor='admin'`, action, target workspace,
   timestamp), not just console logs.
4. **Member visibility read-only first** — the instance-wide "workspace → members" view
   ships read-only; cross-workspace member editing from that view is deferred (per-
   workspace member management still edits via the console).

## Success metrics

- An admin provisions a fully usable workspace (GitHub linked + members invited) without
  ever switching into it or joining it
- Non-admin cannot manage a workspace they don't own (403), verified by tests
- Zero `window.prompt` confirmations remain in the admin surface

## Implementation pointer

`plans/PLAN-041-admin-workspace-management.md` from `plans/template.md`
