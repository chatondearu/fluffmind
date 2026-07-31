# ADR-013 — Instance-admin dangerous workspace operations

- **Status**: proposed
- **Date**: 2026-07-31
- **Tags**: #architecture #admin #workspaces #ops

## Context

Self-hosted instances need recovery tools when a workspace working copy diverges
from GitHub or operators lose orientation across multiple orgs. Workspace **owners**
already have GitHub unlink; they should not get hard-reset/delete powers. Instance
**admins** already manage users via `requireAdminInstance`.

## Decision

- Expose dangerous workspace recovery **only** to instance admins
- Host UI on `/settings/admin` (alongside user admin)
- Implement dedicated `/api/admin/workspaces/*` routes (not owner workspace routes)
- Destructive ops require typing the workspace slug; Git reset uses
  `git reset --hard origin/<configured branch>` under the existing workspace lock

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Owner-accessible danger zone | Too easy to destroy shared vault data |
| CLI-only recovery | Poor fit for Coolify/staging button workflows |
| Danger section only on active workspace settings | No instance inventory / orphan rebind |

## Consequences

- **Positive**: One ops surface to unblock staging; path checks reuse `WORKSPACES_ROOT`
- **Negative**: Hard reset discards unpushed local commits by design
- **Constraint**: Must never delete paths outside `WORKSPACES_ROOT`; must not expose
  these APIs without `requireAdminInstance`

## References

- [[../../prd/PRD-039-admin-dangerous-workspace-ops|PRD-039]]
- `docs/superpowers/specs/2026-07-31-admin-dangerous-workspace-ops-design.md`
- `apps/web/server/utils/admin.ts`
