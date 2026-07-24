# PLAN-033 — GitHub App installations (self-hosted)

- **Status**: draft
- **PRD**: [[../prd/PRD-033-github-app-installations|PRD-033]]
- **Date**: 2026-07-24
- **Detailed plan**: `docs/superpowers/plans/2026-07-24-github-app-installations.md`
- **Design**: `docs/superpowers/specs/2026-07-24-github-app-installations-design.md`
- **ADR**: [[../foam/decisions/ADR-009-github-app-installations|ADR-009]]

## Summary

Self-hosted Fluffmind instances configure their own GitHub App. One installation can
back many workspaces (one repo each). Installation tokens power collaborator sync and
git HTTPS; PAT linking remains fallback.

## Constraints (from ADRs)

| ADR | Constraint |
| --- | ---------- |
| [[../foam/decisions/ADR-002-server-side-git-sync|ADR-002]] | Server-only Git writer |
| [[../foam/decisions/ADR-006-better-auth-workspaces|ADR-006]] | Hybrid sync + OAuth login unchanged |
| [[../foam/decisions/ADR-009-github-app-installations|ADR-009]] | Per-instance App; App preferred, PAT fallback |

## Scope

See detailed plan Tasks 1–8. Out of scope: marketplace App, multi-repo workspace, forced PAT migration.

## Verification

See detailed plan Task 8 + manual App install → bind → sync → push smoke.
