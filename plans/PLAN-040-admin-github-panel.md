# PLAN-040 — Admin GitHub App panel

- **Status**: done
- **PRD**: [[../prd/PRD-040-admin-github-panel|PRD-040]] (shipped 2026-07-31)
- **ADR**: [[../foam/decisions/ADR-014-admin-github-panel|ADR-014]] (accepted)
- **Date**: 2026-07-31

## Pointer

Task-level checklist, file list, and verification commands live in the detailed plan:

`docs/superpowers/plans/2026-07-31-admin-github-panel.md`

Design: `docs/superpowers/specs/2026-07-31-admin-github-panel-design.md`

## Summary

Instance admins get a GitHub App panel on `/settings/admin` (third panel alongside
Users and Workspaces) to inspect App env status, list installations with linked
workspaces, resync account metadata from GitHub, unlink all workspaces for an
installation (keeping the row), or remove an orphan installation from the DB — all
gated by `requireAdminInstance` and `installationId` confirmation on destructive
actions. Local DB only; no GitHub-side App uninstall.
