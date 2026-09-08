# PLAN-041 — Admin workspace management console

- **Status**: done
- **PRD**: [[../prd/PRD-041-admin-workspace-management|PRD-041]] (shipped 2026-09-08)
- **ADR**: [[../foam/decisions/ADR-015-instance-admin-workspace-authority|ADR-015]] (accepted)
- **Date**: 2026-09-07

## Summary

Give instance admins implicit owner-equivalent authority over any workspace without
membership. Introduce one shared `requireWorkspaceManageAuthority(event, workspaceId)`
guard, make every workspace-management endpoint target a workspace by explicit id
(uniform for owners and admins), add an `admin_audit` table for admin cross-workspace
mutations, and build a per-workspace admin console at
`/settings/admin/workspaces/[id]` reusing the owner settings components — with an
accessible confirmation modal and a read-only instance-wide member overview.

## Constraints (from ADRs)

| ADR | Constraint |
| --- | ---------- |
| [[../foam/decisions/ADR-015-instance-admin-workspace-authority|ADR-015]] | Admin authority is an app-level override, not a new Better Auth role; non-admin/non-owner must still get 403; admin writes audit-logged |
| [[../foam/decisions/ADR-013-admin-dangerous-workspace-ops|ADR-013]] | Destructive ops stay admin-only; paths never escape `WORKSPACES_ROOT`; ASCII `statusMessage` |
| [[../foam/decisions/ADR-006-better-auth-workspaces|ADR-006]] | `read`/`write`/`owner` roles + `workspace:manage` remain the owner-side source of truth |
| [[../foam/decisions/ADR-002-server-side-git-sync|ADR-002]] | Server stays single Git writer; mutations under the workspace lock |

Do not violate accepted ADRs without superseding them.

## Scope

### In scope

- Shared authority guard + uniform `workspaceId` targeting across `api/workspaces/**`
- `admin_audit` table + audit writes on admin cross-workspace mutations
- Admin route `/settings/admin/workspaces/[id]` reusing owner components
- Accessible confirmation modal replacing `window.prompt(slug)` in the admin surface
- Read-only instance-wide "workspace → members" overview

### Out of scope

- Self-serve browse/join of workspaces by non-invited users
- Multi-step create→link→invite wizard (separate track)
- Cross-workspace member *editing* from the overview (read-only first)
- New Better Auth role hierarchy; changes to note read/write scoping
- Deleting GitHub remote repos

## Technical approach

**DB (`packages/db`)** — add `admin_audit` (id, actorUserId, actor `'admin'|'owner'`,
action, targetWorkspaceId, detail jsonb, createdAt) to the schema + a Drizzle migration
under `packages/db/drizzle/`. Export an `insertAdminAudit` helper.

**Guard (`apps/web/server/utils`)** — new `requireWorkspaceManageAuthority(event, workspaceId)`:
resolve session; if `requireAdminInstance` passes → `{ workspaceId, actor: 'admin' }`;
else if caller is an `owner` member of `workspaceId` → `{ workspaceId, actor: 'owner' }`;
else 403. Replaces the ~10 duplicated local `requireOwnerRole` helpers. Add a small
`auditAdminAction(actor, ...)` wrapper that no-ops for `actor==='owner'`.

**Endpoint refactor (`apps/web/server/api/workspaces/**`)** — thread an explicit
`workspaceId` (path segment or body) through: GitHub `link`/`link.delete`/`create-and-link`/
`sync`/`invite-candidates`, `agent` tokens (`index.get/patch`, `tokens.post`, `tokens/[id].delete`),
`invitations` (`index.get/post`), content-roots, member role/remove. Each swaps
`resolveActiveWorkspaceId` + local owner check for the shared guard and audits on admin.

**UI (`apps/web/app`)** — extract the owner settings sections in `pages/settings/workspace.vue`
into reusable components parameterized by `workspaceId` (Members, GitHubSync, ContentRoots,
Tokens). New `pages/settings/admin/workspaces/[id].vue` composes them + the danger zone.
`pages/settings/admin.vue` links each workspace row to the new route and gains a read-only
members overview. New `ConfirmActionDialog` (name echo, not free-text slug prompt) replaces
`window.prompt`.

## Tasks

- [x] `admin_audit` schema + migration + `insertAdminAudit` (packages/db)
- [x] `requireWorkspaceManageAuthority` + `auditAdminAction` helpers + unit tests
- [x] Migrate GitHub workspace endpoints to id-targeting + shared guard + audit
- [x] Migrate agent/MCP token endpoints
- [x] Migrate invitations + member role/remove endpoints
- [x] Migrate content-roots endpoint(s)
- [x] Remove duplicated `requireOwnerRole` helpers
- [x] Extract owner settings sections into `workspaceId`-parameterized components
- [x] `pages/settings/admin/workspaces/[id].vue` (management + danger zone)
- [x] `ConfirmActionDialog` replacing `window.prompt` in admin surface
- [x] Read-only instance-wide members overview on `/settings/admin`
- [x] Docs: update `apps/docs` admin guide + `README`/`AGENTS.md` if env/behavior shifts

## Risks & mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Broad endpoint refactor regresses owner access | Migrate one endpoint group at a time; keep/extend owner tests; assert 403 for non-owner/non-admin on each |
| Better Auth org APIs assume active org | Pass explicit id everywhere; add a membership+role lookup by id instead of relying on the active-org session field |
| Admin acts on wrong workspace | Confirmation modal shows resolved name+slug; audit row records target id |
| Migration drift (auth-enabled deploys) | Follow existing Drizzle flow; migration applied by container entrypoint per README |

## Test plan

- [x] Guard: admin passes for any id; owner passes only for owned id; others 403
- [x] Each migrated endpoint: owner (own ws) ok, admin (foreign ws) ok, non-member 403
- [x] `admin_audit` row written on admin mutation, not on owner mutation
- [x] Read-only members overview lists members across workspaces for admin only
- [x] Component tests for the extracted owner sections (first Vue component tests)

## Verification

- [x] Lint / typecheck / test / build green (new CI pipeline)
- [ ] Manual: admin links GitHub + invites a member on a workspace they don't belong to
- [x] Update foam / ADR-015 → accepted once implemented
