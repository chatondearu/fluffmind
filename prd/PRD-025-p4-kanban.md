# PRD-025 — Kanban boards (P4)

- **Status**: approved
- **GitHub**: [#25](https://github.com/chatondearu/fluffmind/issues/25) (epic)
- **Milestone**: P4 — Kanban

## Goal

Drag-and-drop Kanban boards stored as plain markdown compatible with the Obsidian
Kanban plugin convention (`kanban-plugin: board`, `##` headings = columns,
`- [ ]` list items = cards), persisting via `writeToWorkspace`.

## Exit criteria

- [x] Open a board note in a Kanban UI (columns + cards)
- [x] Drag cards between columns and reorder columns/cards
- [x] Add, rename, delete columns and cards
- [x] Saved markdown opens legibly in Obsidian / VS Code
- [x] All writes use existing `PUT /api/notes/:id` path (serialized markdown body)

## Format (Obsidian-compatible subset)

```markdown
---
kanban-plugin: board
---

## To Do
- [ ] First card
- [ ] Second card

## Done
- [x] Shipped item
```

## Out of scope (P4)

- `%% kanban:settings %%` metadata blocks (preserve if present, do not edit)
- Linked-page metadata cards, dates, tags UI
- Kanban as an editor-blocks block type (separate board view)

## Architecture constraints

| ADR | Constraint |
| --- | ---------- |
| [[../foam/decisions/ADR-001-markdown-git-source-of-truth|ADR-001]] | Board file is markdown on disk |
| [[../foam/decisions/ADR-002-server-side-git-sync|ADR-002]] | `writeToWorkspace` only |
