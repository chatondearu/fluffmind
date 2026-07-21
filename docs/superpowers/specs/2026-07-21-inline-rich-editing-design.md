# Inline rich editing (markdown-as-you-type) — design spec

- **Status**: approved (2026-07-21)
- **Supersedes**: PRD-030 non-goal « Éditeur WYSIWYG inline »
- **Related**: [[2026-07-11-notion-editor-design|Notion editor Phase 3]], `DESIGN.md` § Editor, ADR-008
- **Package**: `packages/editor-blocks`

## Goal

Edit inline content **inside the styled render** (Notion-like): no switch to raw
markdown on focus. Transform common markdown delimiters **as the user types**.
Show a format bubble toolbar **only when text is selected**. Keyboard shortcuts
mirror Notion for bold / italic / code / link.

Markdown on disk remains the source of truth (ADR-001). No TipTap / ProseMirror.

## Decisions locked in

| Topic | Choice |
| ----- | ------ |
| Approach | Contenteditable riche + input rules (not AST re-render per keystroke, not TipTap) |
| Toolbar | Same ship as as-you-type (visible only on non-collapsed selection) |
| Marks v1 | Bold, italic, inline code, markdown link, wikilink |
| Shortcuts | `Cmd/Ctrl+B`, `I`, `E`, `K` |
| Soft undo after transform | Best-effort in v1; document as follow-up if fragile |

## UX

### Default editing

- Single surface per text block: always styled (`strong`, `em`, `code`, links).
- Caret moves inside marks; typing extends surrounding mark when appropriate
  (browser default + our wrap/unwrap helpers).
- Plain click on a link / wikilink **navigates** (existing behavior).
- Placing the caret in the label (or selecting it) edits the visible text.

### Markdown-as-you-type (input rules)

Trigger on **closing delimiter**, not on blur:

| Typed pattern | Becomes |
| ------------- | ------- |
| `**text**` or `__text__` | strong |
| `*text*` or `_text_` | emphasis (avoid `__` collision) |
| `` `code` `` | inline code |
| `[label](url)` | link |
| `[[target]]` / `[[target\|alias]]` | wikilink |

Rules:

- Skip escaped delimiters (`\*`, `` \` ``, etc.).
- Do not run rules inside an existing `inlineCode` node.
- After transform: remove delimiters from the DOM; place caret just after the mark.
- Block-level promote (`# `, `- `, …) stays on existing blur / promote path — out of this spec.

### Selection toolbar

- Collapsed caret → no toolbar.
- Non-empty selection inside the block → floating bubble above selection
  (same positioning pattern as `SlashMenu`).
- Buttons: Bold · Italic · Code · Link · Wikilink.
- Active state when selection is already wrapped in that mark (toggle wrap/unwrap).
- Link → lightweight URL prompt; wikilink → target prompt (vault note list when
  available via editor context, else free text).

### Keyboard

| Shortcut | Action |
| -------- | ------ |
| `Cmd/Ctrl+B` | Toggle bold |
| `Cmd/Ctrl+I` | Toggle italic |
| `Cmd/Ctrl+E` | Toggle inline code |
| `Cmd/Ctrl+K` | Link (prompt URL) |

## Architecture

```
InlineRichSurface.vue
  ├─ contenteditable DOM (styled)
  ├─ inline-input-rules.ts   (pure: detect + apply on plain/DOM snapshot)
  ├─ inline-marks.ts         (wrap/unwrap selection)
  ├─ inline-dom.ts           (InlineNode[] ↔ DOM, caret offsets)
  └─ InlineFormatToolbar.vue (selection bubble)

Blocks (paragraph, heading, lists, blockquote, callout, …)
  └─ use InlineRichSurface instead of InlineEditable preview/edit toggle
```

### Data flow

1. User types / selects in contenteditable.
2. On `input` / `keydown`: run input rules when a closing pattern completes.
3. Sync DOM → `InlineNode[]` (immediate or short debounce) via `inline-dom`.
4. Emit `update:inlines` to the block; serialize with existing `inlinesToMarkdown`
   on save (unchanged write path).

### Runtime source of truth

- While focused: **DOM**.
- On commit (input debounce + blur): **`InlineNode[]`** on the `BlockNode`.
- On disk: **markdown** (ADR-001).

### Guardrails (DESIGN.md)

Still **not** a full rich-text engine: no collaborative CRDT, no arbitrary nested
mark algebra beyond what remark already round-trips, no sticky always-on format bar.
Expand only when real limits show up in use.

## File / API sketch

| Module | Responsibility |
| ------ | ---------------- |
| `components/InlineRichSurface.vue` | Contenteditable surface + event wiring |
| `components/InlineFormatToolbar.vue` | Bubble UI |
| `inline-dom.ts` | Serialize/parse between DOM and `InlineNode[]` |
| `inline-input-rules.ts` | Pattern match + transform helpers (unit-tested) |
| `inline-marks.ts` | Selection wrap/unwrap + shortcut handlers |
| Deprecate path | `InlineEditable` preview↔markdown toggle removed or thin wrapper |

Reuse / extend `contenteditable.ts` offset helpers for multi-node text trees.

## Testing

- Unit: each input rule + escapes + `*`/`_` non-collision + no-op inside code.
- Unit: wrap/unwrap bold/italic/code; link/wikilink create; markdown round-trip.
- Unit/component: toolbar open only when selection is non-collapsed.
- Manual: FR accents / IME composition does not break mid-mark typing.

## Out of scope (v1)

- Colors, highlight, underline, comments.
- Always-visible / sticky format toolbar.
- Soft-undo Backspace immediately after transform (follow-up if not cheap).
- TipTap / ProseMirror adoption.
- Changing on-disk format away from markdown.

## Product memory updates

- ADR-008: adopt contenteditable + input rules; supersede PRD-030 WYSIWYG non-goal for this bounded scope.
- Amend PRD-030 non-goals note + `DESIGN.md` § Editor one-liner pointing at this spec.
- Notion editor Phase 3 item (« markdown shortcuts, inline marks WYSIWYG ») satisfied by this work.

## Success criteria

- User can type `**bold**` and see bold without leaving styled mode.
- Selection shows format bubble; `Cmd+B` toggles bold.
- Links/wikilinks remain clickable when not editing the label.
- Round-trip fixtures for marked paragraphs still pass; Obsidian-readable markdown on disk.
