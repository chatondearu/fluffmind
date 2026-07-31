# PRD-040 — Instance admin GitHub App panel

- **Status**: shipped
- **Shipped**: 2026-07-31
- **Date**: 2026-07-31
- **Tags**: #product #admin #github #ops
- **Depends on**: [[PRD-033-github-app-installations|PRD-033]], [[PRD-039-admin-dangerous-workspace-ops|PRD-039]]
- **Design spec**: `docs/superpowers/specs/2026-07-31-admin-github-panel-design.md`
- **Plan**: [[../plans/PLAN-040-admin-github-panel|PLAN-040]] · `docs/superpowers/plans/2026-07-31-admin-github-panel.md`
- **ADR**: [[../foam/decisions/ADR-014-admin-github-panel|ADR-014]] (accepted)

## Problem

After workspace delete/unlink, operators cannot see whether the **instance** still
has GitHub App installations recorded, nor safely resync or prune orphan rows.
Installations are instance-scoped (ADR-009) but only visible today in owner
create/link flows.

## Goals

- [x] Admin GitHub panel on `/settings/admin`
- [x] Show App status (env + permissions) and install URL when available
- [x] List installations with linked workspaces
- [x] Resync installation account from GitHub
- [x] Unlink all workspaces for an installation (keep installation row)
- [x] Remove installation from DB (local only; confirm installation id)

## Non-goals

- GitHub-side App uninstall via API
- PAT / invitation / bulk member sync management
- Dedicated admin GitHub route in v1

## Users & scenarios

| Persona | Scenario |
| ------- | -------- |
| Instance admin | Deleted a workspace, worries App is gone → panel shows installation still present |
| Instance admin | Stale account login in DB → Resynchroniser |
| Instance admin | Orphan installation after uninstall webhook missed → Retirer de la DB |
| Instance admin | Need to clear all workspace links for one install without deleting the row → Unlink tous |

## Requirements

### Functional

- [x] `GET /api/admin/github` (status + installations + installUrl)
- [x] Resync / unlink-all / remove-from-DB endpoints under `/api/admin/github/*`
- [x] `installationId` confirmation on destructive actions
- [x] UI as third panel on admin settings page

### Non-functional

- [x] All routes `requireAdminInstance`
- [x] Reuse existing installation helpers; no schema change
- [x] French UI copy; do not delete remote GitHub repositories
- [x] ASCII `statusMessage` with detail in `message`

## Related project memory

- ADRs: [[../foam/decisions/ADR-014-admin-github-panel|ADR-014]], [[../foam/decisions/ADR-009-github-app-installations|ADR-009]], [[../foam/decisions/ADR-013-admin-dangerous-workspace-ops|ADR-013]]
- Design: `docs/superpowers/specs/2026-07-31-admin-github-panel-design.md`

## Success criteria

- Admin can diagnose App + installations without SSH/DB
- Remove-from-DB and unlink-all behave as documented; resync refreshes account fields
- Non-admin cannot call admin GitHub routes
