# ADR-015 — Instance-admin authority over any workspace

- **Status**: accepted
- **Date**: 2026-09-07
- **Tags**: #architecture #admin #workspaces #authz

## Context

"Instance admin" and "workspace owner" are today two **non-hierarchical** roles.
`requireAdminInstance` (user-level `role='admin'`) gates the danger zone on
`/settings/admin` (reset-hard, unlink, delete, rebind — ADR-013/014), while every
*configuration* action on a workspace (members & invitations, GitHub link/sync,
content roots, MCP/agent tokens, agent enable) is gated by a locally-duplicated
`requireOwnerRole` that checks `member.role === 'owner'` **on the caller's active
workspace** (resolved from the `ACTIVE_WORKSPACE_COOKIE`).

Consequences an operator hits in practice:

- An admin sees every workspace in the admin panel but can only **destroy** them; to
  manage members or GitHub for a workspace they must first be invited as an `owner`
  member of it.
- Owner endpoints only ever act on the **active** workspace (cookie), so there is no
  server surface to manage a *specific* workspace by id without switching into it.
- `requireOwnerRole` is copy-pasted across ~10 handlers (`api/workspaces/**`), so the
  authority rule lives in many places and drifts.

We want an admin to administer **any** workspace on the instance as if they were its
owner, without membership, and without weakening owner isolation for non-admins.

## Decision

1. **Authority model** — introduce a single guard
   `requireWorkspaceManageAuthority(event, workspaceId)` that authorizes the request
   when the caller is **either** an instance admin (`requireAdminInstance` passes)
   **or** an `owner` member of `workspaceId`. It returns the resolved `workspaceId`
   and an `actor` discriminator (`'admin' | 'owner'`) for auditing.

2. **Uniform explicit targeting** — management handlers accept an explicit `workspaceId`
   (path/body) for **all** callers; the active-cookie workspace is no longer implicit
   authority. Owners may only target a workspace they own; admins may target any. The
   owner UI passes its active workspace id explicitly, so behavior is unchanged for them.

3. **Consolidate the rule** — replace the duplicated local `requireOwnerRole` helpers
   with the shared guard. Better Auth's `workspace:manage` permission stays the
   owner-side source of truth; the admin branch is an explicit instance-level override
   layered on top, not a new Better Auth role.

4. **UI** — per-workspace management lives on a dedicated admin route
   `/settings/admin/workspaces/[id]` (members, GitHub sync, content roots, tokens +
   danger zone), reusing the owner settings components, with an accessible confirmation
   modal replacing `window.prompt(slug)`. An instance-wide "workspace → members" view
   ships **read-only** first. Owner `/settings/workspace` is unchanged.

5. **Audit** — admin cross-workspace mutations are recorded in a dedicated `admin_audit`
   table (actor user id, `actor='admin'`, action, target workspace id, timestamp), not
   only console logs.

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Admin self-adds as `owner` member (button) | Pollutes each workspace's member list with the admin; sync/localOverride edge cases; still leaves owner endpoints active-workspace-only |
| New Better Auth role above `owner` | Better Auth roles are per-organization membership; "authority without membership" doesn't fit its model — an app-level override is simpler and honest |
| Keep admin to instance-only ops (enrich those) | Does not solve the core ask: admin still cannot manage members/GitHub/tokens of a workspace they don't belong to |
| Impersonation ("act as owner" session swap) | Heavier, riskier (full session elevation), and harder to audit than a scoped per-request guard |

## Consequences

- **Positive**: One authority rule instead of ~10 copies; an admin can fully operate any
  workspace without membership; owner isolation for non-admins is unchanged; management
  endpoints become addressable by id (also useful for a future CLI/API).
- **Negative**: Management handlers gain a `workspaceId` parameter and lose the implicit
  "active workspace" assumption — a mechanical but broad refactor across `api/workspaces/**`.
- **Constraint**: The admin branch must never widen access for non-admins; every migrated
  endpoint must still reject a non-owner, non-admin with 403. Admin cross-workspace writes
  must be audit-logged. No change to note read/write scoping (`note:read`/`note:write`).

## References

- [[../../prd/PRD-041-admin-workspace-management|PRD-041]]
- Guards: `apps/web/server/utils/admin.ts` (`requireAdminInstance`),
  `apps/web/server/utils/auth.ts`, `apps/web/server/utils/workspace-membership.ts`
- Duplicated rule: `requireOwnerRole` across `apps/web/server/api/workspaces/**`
- Prior admin work: [[ADR-013-admin-dangerous-workspace-ops|ADR-013]],
  [[ADR-014-admin-github-panel|ADR-014]]
- Permissions model: `packages/db/src/permissions.ts`
