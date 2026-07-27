# PLAN-034 — Create GitHub repo on workspace create

- **Status**: ready
- **PRD**: [[../prd/PRD-034-github-repo-on-workspace-create|PRD-034]]
- **Date**: 2026-07-27
- **Detailed plan**: `docs/superpowers/plans/2026-07-27-github-repo-on-workspace-create.md`
- **Design**: `docs/superpowers/specs/2026-07-27-github-repo-on-workspace-create-design.md`
- **ADR**: [[../foam/decisions/ADR-009-github-app-installations|ADR-009]] (extended)

## Summary

Optionally create a GitHub repository via the instance GitHub App when creating a
workspace, then link it (`authMode=app`). Soft-fail keeps the workspace on GitHub
errors; Settings provides retry. Requires Repository Administration R/W on the App.
