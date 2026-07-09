# Spike #55 — markdown round-trip findings

Issue: [#55](https://github.com/chatondearu/fluffmind/issues/55)

## What was proven

- `remark` mdast → spike `BlockNode[]` → markdown serializer round-trips cleanly for:
  - headings (h1–h6)
  - paragraphs with **bold**, *italic*, `` `inline code` ``, [links](url)
  - bullet and ordered lists (single level)
  - fenced code blocks with optional language tag
- Implementation lives in `packages/editor-blocks/src/{mdast-to-blocks,blocks-to-markdown,round-trip}.ts`
- Tests: `src/round-trip.test.ts` with five fixtures modeled on `foam/` note shapes

## Known gaps (follow-up issues)

| Gap | Target issue |
| --- | ------------ |
| Wikilinks `[[note]]` / `[[note\|alias]]` preserved as plain text or lost | #62 |
| GFM tables | #63 |
| Nested lists (multi-level) | extend deserializer in #57 |
| Blockquote, thematic break, HTML nodes | fallback block or P3 scope decision |
| Frontmatter | vault layer only — never in block editor body |
| `defineBlock()` registry + Vue UI | #56, #59 |

## Serializer rules (draft)

1. Blocks separated by a single blank line (`\n\n`).
2. Headings: ATX style (`#` × depth + space + inline content).
3. Lists: `- item` or `1. item`; continuation lines indented 2–3 spaces.
4. Fenced code: opening fence includes lang tag when present; trailing newline on code body stripped on parse.
5. Inline marks: `**strong**`, `*emphasis*`, `` `code` ``, `[text](url)`.

## Recommendation for #56–#58

1. Promote `BlockNode` / `InlineNode` from spike types into the canonical model (#56).
2. Move mdast (de)serializer into dedicated modules; add unknown-node fallback tests (#57–#58).
3. Do **not** add ProseMirror or third-party editor deps — keep pipeline remark-based per `DESIGN.md`.
