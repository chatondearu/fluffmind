# PRD-024 — Custom block editor (P3)

- **Status**: approved
- **GitHub**: [#24](https://github.com/chatondearu/fluffmind/issues/24) (epic)
- **Milestone**: P3 — Custom block editor

## Goal

Ship `packages/editor-blocks`: an in-house block editor (no third-party framework) where
**one block = one Vue component** registered via `defineBlock()`, with drag-and-drop
reorder and reliable markdown round-trip on common note structures.

## Exit criteria

- [ ] Block editing works in the web UI (replaces P1 textarea on the note page)
- [ ] Reliable round-trip for headings, lists, links, fenced code, simple tables
- [ ] Files edited in Fluffmind reopen cleanly in VS Code/Obsidian
- [ ] Saves still go through `writeToWorkspace` (no new write path)

## Scope

- [ ] Block model + `defineBlock()` registry
- [ ] Markdown ↔ block tree (deserialize / serialize)
- [ ] Core blocks: paragraph, heading, bullet/ordered list, code fence
- [ ] `BlockEditor` shell with drag-and-drop
- [ ] Limited inline marks: bold, italic, inline code, links (`contenteditable` + markdown-as-you-type — **not** ProseMirror)
- [ ] Wikilink block (PKM-specific)
- [ ] Simple table block
- [ ] Integration in `apps/web` note page
- [ ] Round-trip validation fixtures

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
