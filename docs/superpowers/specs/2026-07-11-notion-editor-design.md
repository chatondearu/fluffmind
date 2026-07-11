# Notion-like block editor — design spec

- **Status**: approved (2026-07-11)
- **Scope**: Phase 1 — paragraph/heading, slash menu, keyboard, blank page, autosave

## Goal

Replace the P3 textarea-based editor with a Notion-like writing surface: blank page,
invisible fields, `/` block picker, Enter/Shift+Enter semantics, autosave.

## UX requirements

| Interaction | Behavior |
| ----------- | -------- |
| New/open note | Single empty paragraph, caret ready, no visible inputs |
| `/` at line start | Filterable block type menu (markdown block types) |
| Enter | Split block → new paragraph below, focus it |
| Shift+Enter | Soft line break inside current block |
| Backspace on empty block | Merge with previous block |
| Save | Autosave debounced (~800 ms), subtle status indicator |

## Architecture

Extend `@fluffmind/editor-blocks` in-house (no TipTap/ProseMirror):

- `EditableSurface.vue` — borderless `contenteditable`, plain-text sync
- `SlashMenu.vue` — command palette wired to block registry
- `useBlockEditor.ts` — split/merge/insert/focus orchestration
- Registry metadata — label + slash aliases per block type
- `apps/web` — `/notes/new`, always-on editor + `useNoteAutosave`

Markdown round-trip unchanged (`BlockNode` → `serializeDocument` → disk).

## Phases

1. **Phase 1** (this PR): paragraph, heading, slash, keyboard, new page, autosave
2. **Phase 2**: lists, code, backspace merge polish, drag handle
3. **Phase 3**: markdown shortcuts, inline marks WYSIWYG, wikilinks

## Out of scope

- Real-time collaboration
- Kanban block in editor
- Replacing markdown on disk with JSON
