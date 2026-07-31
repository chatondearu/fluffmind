# PRD-040 — Instance admin GitHub App panel

- **Status**: proposed
- **Date**: 2026-07-31
- **Tags**: #product #admin #github #ops
- **Depends on**: [[PRD-033-github-app-installations|PRD-033]], [[PRD-039-admin-dangerous-workspace-ops|PRD-039]]
- **Design spec**: `docs/superpowers/specs/2026-07-31-admin-github-panel-design.md`
- **ADR**: [[../foam/decisions/ADR-014-admin-github-panel|ADR-014]] (proposed)

## Problem

After workspace delete/unlink, operators cannot see whether the **instance** still
has GitHub App installations recorded, nor safely resync or prune orphan rows.
Installations are instance-scoped (ADR-009) but only visible today in owner
create/link flows.

## Goals

- [ ] Admin GitHub panel on `/settings/admin`
- [ ] Show App status (env + permissions) and install URL when available
- [ ] List installations with linked workspaces
- [ ] Resync installation account from GitHub
- [ ] Unlink all workspaces for an installation (keep installation row)
- [ ] Remove installation from DB (local only; confirm installation id)

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

1. All APIs under `/api/admin/github/*` use `requireAdminInstance`
2. Destructive actions require typing `installationId`
3. Reuse existing installation helpers; no schema change
4. French UI copy; do not delete remote GitHub repositories
5. ASCII `statusMessage` with detail in `message`

## Success criteria

- Admin can diagnose App + installations without SSH/DB
- Remove-from-DB and unlink-all behave as documented; resync refreshes account fields
- Non-admin cannot call admin GitHub routes

## References

- [[../foam/decisions/ADR-009-github-app-installations|ADR-009]]
- [[../foam/decisions/ADR-013-admin-dangerous-workspace-ops|ADR-013]]
- [[../foam/decisions/ADR-014-admin-github-panel|ADR-014]]
- `docs/superpowers/specs/2026-07-31-admin-github-panel-design.md`
