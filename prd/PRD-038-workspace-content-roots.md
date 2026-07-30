# PRD-038 — Workspace content roots

- **Status**: shipped
- **Shipped**: 2026-07-30
- **Date**: 2026-07-30
- **Tags**: #product #workspaces #git #vault
- **Depends on**: [[PRD-023-p2-auth-workspaces|PRD-023]], [[PRD-033-github-app-installations|PRD-033]]
- **Design spec**: `docs/superpowers/specs/2026-07-30-workspace-content-roots-design.md`
- **Plan**: [[../plans/PLAN-038-workspace-content-roots|PLAN-038]] · `docs/superpowers/plans/2026-07-30-workspace-content-roots.md`
- **ADR**: [[../foam/decisions/ADR-012-workspace-content-roots|ADR-012]] (accepted)

## Problem

Linking a GitHub repo always treats the **entire** tree as the Fluffmind vault. Users
who keep Foam/PRD/docs in `foam/` or `docs/` inside a larger product repo cannot use
Fluffmind without indexing unrelated markdown (or cluttering the vault).

## Goals

- [x] Optional `contentRoots` at workspace create and/or first GitHub link
- [x] Index + read + write constrained to those folders (ids stay repo-relative)
- [x] Empty roots = whole repository (backward compatible)
- [x] Roots immutable once a non-empty value is stored (v1); link may set while still `[]`
- [x] Settings shows roots read-only; MCP/workspace info exposes them

## Non-goals

- Sparse checkout
- Editing roots after they are set
- Auth-disabled / `VAULT_PATH` filtering
- Multiple repos per workspace

## Users & scenarios

| Persona | Scenario |
| ------- | -------- |
| Owner | Creates workspace linked to `acme/app`, sets roots `foam`, `docs` → only those trees appear |
| Owner | Leaves roots empty → full-repo vault as today |
| Writer / MCP | Tries to write `src/note.md` → rejected |
| Owner | Opens Settings → sees roots listed, cannot edit |

## Requirements

### Functional

- [x] Persist `contentRoots` on `workspace_config`
- [x] Normalize and validate paths on accept
- [x] Filter vault index and enforce write guards
- [x] Return `contentRoots` on workspace/MCP info APIs
- [x] Create/link UI for multi-path input

### Non-functional

- [x] Existing workspaces with no column/default `[]` unchanged
- [x] ASCII `statusMessage` on violations

## Related project memory

- ADRs: [[../foam/decisions/ADR-012-workspace-content-roots|ADR-012]], [[../foam/decisions/ADR-002-server-side-git-sync|ADR-002]], [[../foam/decisions/ADR-006-better-auth-workspaces|ADR-006]]
- Design: `docs/superpowers/specs/2026-07-30-workspace-content-roots-design.md`

## Success metrics

- Owner links a monorepo with `foam/` only and never sees `src/**/*.md` in the vault
- Writes outside roots fail clearly; writes under roots commit/push as today
- Workspaces without roots behave identically to pre-feature
