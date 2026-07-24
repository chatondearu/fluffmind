# PLAN-033 — GitHub App installations (self-hosted)

- **Status**: done
- **PRD**: [[../prd/PRD-033-github-app-installations|PRD-033]] (shipped 2026-07-24)
- **ADR**: [[../foam/decisions/ADR-009-github-app-installations|ADR-009]] (accepted)
- **Date**: 2026-07-24

## Pointer

Task-level checklist, file list, and verification commands live in the detailed plan:

`docs/superpowers/plans/2026-07-24-github-app-installations.md`

Design spec: `docs/superpowers/specs/2026-07-24-github-app-installations-design.md`

## Summary

Self-hosted Fluffmind instances configure their own GitHub App. One installation can
back many workspaces (one repo each). Installation tokens power collaborator sync and
git HTTPS; PAT linking remains fallback.

Operator env (optional): `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_SLUG`,
`GITHUB_APP_WEBHOOK_SECRET` (fallback `GITHUB_WEBHOOK_SECRET`). App permissions:
Contents R/W, Metadata R, Members/collaborators R.
