# PRD-039 — Instance admin dangerous workspace ops

- **Status**: shipped
- **Shipped**: 2026-07-31
- **Date**: 2026-07-31
- **Tags**: #product #admin #workspaces #ops
- **Depends on**: [[PRD-023-p2-auth-workspaces|PRD-023]], [[PRD-035-auth-production-ready|PRD-035]]
- **Design spec**: `docs/superpowers/specs/2026-07-31-admin-dangerous-workspace-ops-design.md`
- **Plan**: [[../plans/PLAN-039-admin-dangerous-workspace-ops|PLAN-039]] · `docs/superpowers/plans/2026-07-31-admin-dangerous-workspace-ops.md`
- **ADR**: [[../foam/decisions/ADR-013-admin-dangerous-workspace-ops|ADR-013]] (accepted)

## Problem

When a workspace Git working copy diverges or an operator loses track of which
workspaces exist on an instance, there is no admin UI to inventory, hard-reset,
unlink, delete, or rebind vault folders. Staging incidents force SSH/volume hacks.

## Goals

- [x] Admin-only Workspaces panel on `/settings/admin`
- [x] List all workspaces + orphan dirs under `WORKSPACES_ROOT`
- [x] Hard reset to `origin/<gitBranch>` with slug confirmation
- [x] Invalidate vault index; force GitHub unlink
- [x] Delete workspace (DB + disk) with slug confirmation
- [x] Rebind orphan folder to an organization

## Non-goals

- Owner access to dangerous ops
- Deleting GitHub remote repos
- Arbitrary branch reset / bulk ops

## Users & scenarios

| Persona | Scenario |
| ------- | -------- |
| Instance admin | Staging workspace stuck on divergent git → reset-hard → vault usable again |
| Instance admin | After bad create/link, deletes broken workspace and rebinds orphan folder |
| Workspace owner (non-admin) | Does not see dangerous panel; keeps existing unlink |

## Requirements

### Functional

- [x] `GET /api/admin/workspaces` (+ orphans)
- [x] Reset-hard / invalidate / unlink / delete / rebind endpoints
- [x] Slug confirmation on destructive actions
- [x] UI on admin settings page

### Non-functional

- [x] All routes `requireAdminInstance`
- [x] Paths cannot escape `WORKSPACES_ROOT`
- [x] ASCII `statusMessage` on errors

## Related project memory

- ADRs: [[../foam/decisions/ADR-013-admin-dangerous-workspace-ops|ADR-013]], [[../foam/decisions/ADR-002-server-side-git-sync|ADR-002]], [[../foam/decisions/ADR-006-better-auth-workspaces|ADR-006]]
- Design: `docs/superpowers/specs/2026-07-31-admin-dangerous-workspace-ops-design.md`

## Success metrics

- Admin recovers a diverged staging vault without SSH
- Non-admin cannot call admin workspace APIs (403)
- Delete removes org membership surface and vault directory
