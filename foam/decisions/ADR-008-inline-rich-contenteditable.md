# ADR-008 — Contenteditable inline marks (markdown-as-you-type)

- **Status**: accepted
- **Date**: 2026-07-21
- **Tags**: #editor #architecture

## Context

Block editing already feels Notion-like at the block level, but inline marks were
edited by switching the surface to raw markdown (`InlineEditable` preview →
`EditableSurface` plaintext). Users expect to type and format **inside** the
styled render.

PRD-030 listed « Éditeur WYSIWYG inline » as a non-goal to avoid accidental
adoption of a full ProseMirror-class engine. `DESIGN.md` still warns that rich
text is the largest hidden-cost trap for a custom editor — but also says to
expand when a real limitation shows up in use. That limitation is now confirmed.

## Decision

Adopt a **bounded** inline rich surface in `packages/editor-blocks`:

- One contenteditable that renders marks (`strong`, `em`, `code`, links, wikilinks).
- Markdown **input rules** transform delimiters as the user types.
- Format **bubble toolbar only on non-empty selection**, plus `Cmd/Ctrl+B|I|E|K`.
- Keep markdown on disk (ADR-001); sync via existing `InlineNode[]` serialize path.
- **Do not** introduce TipTap / ProseMirror / CRDT for this.

This **supersedes** the PRD-030 non-goal for this scoped feature only. The
broader DESIGN.md guardrail (no full rich-text engine) remains.

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Keep preview ↔ markdown toggle | Confirmed UX friction; fails Notion expectation |
| AST re-render on every keystroke | Fragile caret / IME behavior |
| TipTap / ProseMirror | Explicitly out of DESIGN/AGENTS; high dependency surface |

## Consequences

- **Positive**: Editing matches user expectation; Phase 3 of the Notion editor spec progresses without a third-party engine.
- **Negative**: More DOM ↔ model sync and input-rule edge cases to maintain; IME quirks possible.
- **Constraint**: Scope stays limited to the marks listed in the design spec; no sticky always-on WYSIWYG chrome in v1.

## References

- Spec: `docs/superpowers/specs/2026-07-21-inline-rich-editing-design.md`
- PRD-030 non-goal superseded (scoped)
- `DESIGN.md` § Editor
- Related: [[ADR-001-markdown-git-source-of-truth]]
