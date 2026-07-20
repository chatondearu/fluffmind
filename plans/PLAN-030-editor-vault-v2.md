# PLAN-030 — Editor & Vault v2

- **Status**: shipped
- **PRD**: [[../prd/PRD-030-editor-vault-v2|PRD-030]]
- **Date**: 2026-07-12
- **Shipped**: 2026-07-12 — PRs [#106](https://github.com/chatondearu/fluffmind/issues/106) (DnD, closed) + [#118](https://github.com/chatondearu/fluffmind/pull/118) (P0–P3)

## Summary

Retroactive plan: the split plans `PLAN-030a`…`e` proposed in the PRD were never
created as separate files. Work landed as two commits on `main` then one mega-PR:

1. P0 — DnD by block id, keyboard delete, frontmatter persistence on save
2. P1–P3 — markdown source view, properties panel, sidebar `⋯` + vault mutation APIs,
   noteLink / list Enter / HTML table blocks

## Mapping PRD epics → delivery

| Epic | Phase | Delivery |
| ---- | ----- | -------- |
| D DnD | P0 | `reorderBlocksById`, drag by `block.id` |
| C Keyboard | P0 | `Delete` / empty `Backspace` in `EditableSurface` |
| B1 Frontmatter persist | P0 | `PUT` + `writeToWorkspace` preserve/merge YAML |
| B2 Properties UI | P1 | `NoteFrontmatterPanel.vue` |
| A Source view | P1 | `editorMode` blocks/source on note page |
| E Sidebar `⋯` + APIs | P2 | `VaultContextMenu`, `PATCH`/`DELETE` notes & folders |
| G Lists Enter | P3 | `handleEnter` keeps `bulletList` / `orderedList` |
| F Note link | P3 | `noteLink` block + slash command |
| H HTML table | P3 | `TableBlock.vue` editable grid → GFM |

## Verification

- [x] Code on `main` (`feat(prd-030): …` commits)
- [x] PR [#118](https://github.com/chatondearu/fluffmind/pull/118) merged
- [x] GitHub issues #106–#117 closed / reconciled with shipped status
- [x] PRD-030 status → `shipped`
