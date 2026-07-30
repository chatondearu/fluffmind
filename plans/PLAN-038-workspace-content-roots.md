# PLAN-038 — Workspace content roots

- **Status**: done
- **PRD**: [[../prd/PRD-038-workspace-content-roots|PRD-038]] (shipped 2026-07-30)
- **ADR**: [[../foam/decisions/ADR-012-workspace-content-roots|ADR-012]] (accepted)
- **Date**: 2026-07-30

## Pointer

Task-level checklist, file list, and verification commands live in the detailed plan:

`docs/superpowers/plans/2026-07-30-workspace-content-roots.md`

Design: `docs/superpowers/specs/2026-07-30-workspace-content-roots-design.md`

## Summary

Optional `contentRoots` on `workspace_config` limits vault index and mutations to selected
repo folders (`foam/`, `docs/`, …) while keeping a full Git working copy. Empty `[]` =
whole repository. Roots set at create and/or first GitHub link; immutable once non-empty.
