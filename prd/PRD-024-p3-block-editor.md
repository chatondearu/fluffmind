# PRD-024 — Custom block editor (P3)

- **Status**: shipped
- **GitHub**: [#24](https://github.com/chatondearu/fluffmind/issues/24) (closed)
- **Merged**: PR [#66](https://github.com/chatondearu/fluffmind/pull/66) (2026-07-09)
- **Milestone**: P3 — Custom block editor

## Goal

Ship `packages/editor-blocks`: an in-house block editor (no third-party framework) where
**one block = one Vue component** registered via `defineBlock()`, with drag-and-drop
reorder and reliable markdown round-trip on common note structures.

## Exit criteria

- [x] Block editing works in the web UI (replaces P1 textarea on the note page)
- [x] Reliable round-trip for headings, lists, links, fenced code, simple tables
- [x] Files edited in Fluffmind reopen cleanly in VS Code/Obsidian (validated via fixtures)
- [x] Saves still go through `writeToWorkspace` (no new write path)

## Scope

- [x] Block model + `defineBlock()` registry
- [x] Markdown ↔ block tree (deserialize / serialize)
- [x] Core blocks: paragraph, heading, bullet/ordered list, code fence
- [x] `BlockEditor` shell with drag-and-drop
- [x] Limited inline marks: bold, italic, inline code, links (markdown-as-textarea per block)
- [x] Wikilink block (PKM-specific)
- [x] Simple table block
- [x] Integration in `apps/web` note page
- [x] Round-trip validation fixtures

## Out of scope (P3)

- Full rich-text engine (ProseMirror/TipTap/CRDT)
- Kanban card block, transclusion, backlinks embed (P4+ or follow-ups)
- Collaborative real-time editing

## Architecture constraints

| ADR | Constraint |
| --- | ---------- |
| [[../foam/decisions/ADR-001-markdown-git-source-of-truth|ADR-001]] | Serialized output is plain markdown on disk |
| [[../foam/decisions/ADR-002-server-side-git-sync|ADR-002]] | Persist via existing `writeToWorkspace` API |
| `DESIGN.md` § Editor | Deliberately small rich-text scope |

## Agent notes

- Priority: P3 (current phase)
- Technical risk: #2 in project (after Git sync)
- Reuse `remark` / mdast patterns from `apps/web/server/vault/parser.ts` where possible
