# PRD-039 — Instance admin dangerous workspace ops

- **Status**: draft
- **Date**: 2026-07-31
- **Tags**: #product #admin #workspaces #ops
- **Depends on**: [[PRD-023-p2-auth-workspaces|PRD-023]], [[PRD-035-auth-production-ready|PRD-035]]
- **Design spec**: `docs/superpowers/specs/2026-07-31-admin-dangerous-workspace-ops-design.md`
- **ADR**: [[../foam/decisions/ADR-013-admin-dangerous-workspace-ops|ADR-013]]

## Problem

When a workspace Git working copy diverges or an operator loses track of which
workspaces exist on an instance, there is no admin UI to inventory, hard-reset,
unlink, delete, or rebind vault folders. Staging incidents force SSH/volume hacks.

## Goals

- [ ] Admin-only Workspaces panel on `/settings/admin`
- [ ] List all workspaces + orphan dirs under `WORKSPACES_ROOT`
- [ ] Hard reset to `origin/<gitBranch>` with slug confirmation
- [ ] Invalidate vault index; force GitHub unlink
- [ ] Delete workspace (DB + disk) with slug confirmation
- [ ] Rebind orphan folder to an organization

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

- [ ] `GET /api/admin/workspaces` (+ orphans)
- [ ] Reset-hard / invalidate / unlink / delete / rebind endpoints
- [ ] Slug confirmation on destructive actions
- [ ] UI on admin settings page

### Non-functional

- [ ] All routes `requireAdminInstance`
- [ ] Paths cannot escape `WORKSPACES_ROOT`
- [ ] ASCII `statusMessage` on errors

## Related project memory

- ADRs: [[../foam/decisions/ADR-013-admin-dangerous-workspace-ops|ADR-013]], [[../foam/decisions/ADR-002-server-side-git-sync|ADR-002]], [[../foam/decisions/ADR-006-better-auth-workspaces|ADR-006]]
- Design: `docs/superpowers/specs/2026-07-31-admin-dangerous-workspace-ops-design.md`

## Success metrics

- Admin recovers a diverged staging vault without SSH
- Non-admin cannot call admin workspace APIs (403)
- Delete removes org membership surface and vault directory
