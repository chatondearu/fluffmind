# PLAN-039 — Admin dangerous workspace ops

- **Status**: done
- **PRD**: [[../prd/PRD-039-admin-dangerous-workspace-ops|PRD-039]] (shipped 2026-07-31)
- **ADR**: [[../foam/decisions/ADR-013-admin-dangerous-workspace-ops|ADR-013]] (accepted)
- **Date**: 2026-07-31

## Pointer

Task-level checklist, file list, and verification commands live in the detailed plan:

`docs/superpowers/plans/2026-07-31-admin-dangerous-workspace-ops.md`

Design: `docs/superpowers/specs/2026-07-31-admin-dangerous-workspace-ops-design.md`

## Summary

Instance admins get a Workspaces panel on `/settings/admin` to inventory all org
workspaces and orphan vault folders under `WORKSPACES_ROOT`, then recover staging
incidents via hard reset, index invalidation, forced GitHub unlink, full delete, or
orphan rebind — all gated by `requireAdminInstance` and slug confirmation on
destructive actions.
