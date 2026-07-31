# ADR-014 — Instance-admin GitHub App panel

- **Status**: accepted
- **Date**: 2026-07-31
- **Tags**: #architecture #admin #github #ops

## Context

ADR-009 stores GitHub App installations at **instance** scope (one installation →
many workspaces). PRD-039 added admin workspace recovery but not installation
inventory. Operators confuse workspace unlink/delete with App loss because
installations only surface in owner create/link UI.

## Decision

- Expose GitHub App status + installation recovery **only** to instance admins
- Host UI as a third panel on `/settings/admin` (with Users and Workspaces)
- Implement dedicated `/api/admin/github/*` routes (not owner `/api/github/*`)
- Local DB ops only for remove/unlink-all — never call GitHub to uninstall the App
- Resync uses existing App JWT + `GET /app/installations/{id}` via `fetchInstallationAccount`

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Extend owner `/api/github/*` for admins | Mixes auth models; harder to audit |
| Read-only status panel | Insufficient for orphan/stale recovery |
| GitHub uninstall API from admin UI | Irreversible; needs Administration permission; out of v1 |

## Consequences

- **Positive**: Makes ADR-009 mutualization visible; safe prune/resync without SSH
- **Negative**: Admin page grows denser (acceptable for v1)
- **Constraint**: Must not delete remote repositories; must gate with `requireAdminInstance`

## References

- [[ADR-009-github-app-installations|ADR-009]]
- [[ADR-013-admin-dangerous-workspace-ops|ADR-013]]
- [[../../prd/PRD-040-admin-github-panel|PRD-040]]
- `docs/superpowers/specs/2026-07-31-admin-github-panel-design.md`
