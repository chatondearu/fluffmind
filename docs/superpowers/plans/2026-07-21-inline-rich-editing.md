# Inline Rich Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit inline marks inside the styled contenteditable (Notion-like): markdown-as-you-type + selection format toolbar + keyboard shortcuts, without TipTap/ProseMirror.

**Architecture:** Pure helpers (`inline-dom`, `inline-input-rules`, `inline-marks`) operate on `InlineNode[]` / plain strings; `InlineRichSurface.vue` owns one contenteditable DOM as runtime source of truth while focused; `InlineFormatToolbar.vue` shows only on non-collapsed selection. Text blocks swap `InlineEditable` for `InlineRichSurface`.

**Tech Stack:** Vue 3 `<script setup>`, existing `contenteditable.ts` offsets, `inlines.ts` serialize/parse, Vitest, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-21-inline-rich-editing-design.md` · **ADR:** `foam/decisions/ADR-008-inline-rich-contenteditable.md`

## Global Constraints

- No TipTap / ProseMirror / CRDT.
- Markdown on disk remains source of truth (ADR-001); save path unchanged.
- Marks v1 only: `strong`, `emphasis`, `inlineCode`, `link`, `wikilink`.
- Toolbar only when selection is non-collapsed.
- Soft-undo after transform is best-effort; skip if it blocks shipping.
- Package tests: `pnpm --filter @fluffmind/editor-blocks run test`
- Typecheck: `pnpm --filter @fluffmind/editor-blocks run typecheck`
- Conventional Commits (`feat(editor): …`, `test(editor): …`, `refactor(editor): …`).
- Vue components: `<script setup lang="ts">` + typed props (Anthony Fu style).
- Code comments in English; user-facing UI copy may be French (match existing slash menu).

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/editor-blocks/src/inline-dom.ts` | `InlineNode[]` ↔ contenteditable DOM; read/write root |
| `packages/editor-blocks/src/inline-dom.test.ts` | Round-trip DOM helpers (jsdom or string HTML parse) |
| `packages/editor-blocks/src/inline-input-rules.ts` | Match closing markdown patterns at caret in a text leaf |
| `packages/editor-blocks/src/inline-input-rules.test.ts` | Each pattern + escapes + collisions |
| `packages/editor-blocks/src/inline-marks.ts` | Toggle wrap/unwrap by plain-text offsets on `InlineNode[]` |
| `packages/editor-blocks/src/inline-marks.test.ts` | Bold/italic/code/link/wikilink toggle |
| `packages/editor-blocks/src/components/InlineFormatToolbar.vue` | Bubble UI (Teleport + fixed pos like SlashMenu) |
| `packages/editor-blocks/src/components/InlineRichSurface.vue` | Contenteditable + rules + toolbar + shortcuts |
| `packages/editor-blocks/src/components/InlineEditable.vue` | Thin re-export / delete after migration |
| `packages/editor-blocks/src/components/blocks/*.vue` | Paragraph, Heading, List, TaskList, Blockquote, Callout → `InlineRichSurface` |
| `packages/editor-blocks/src/index.ts` | Export new public helpers if useful |
| `packages/editor-blocks/src/components/RichInlineView.vue` | Keep for read-only if needed; unused by editor path after swap |
| `packages/editor-blocks/src/components/RichInlineNodes.vue` | Reuse styles/classes inside `inline-dom` write path or toolbar-less render |

---

### Task 1: `inline-input-rules` — match closing patterns

**Files:**
- Create: `packages/editor-blocks/src/inline-input-rules.ts`
- Test: `packages/editor-blocks/src/inline-input-rules.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type InputRuleMatch =
    | { kind: 'strong' | 'emphasis' | 'inlineCode', start: number, end: number, content: string }
    | { kind: 'link', start: number, end: number, content: string, url: string }
    | { kind: 'wikilink', start: number, end: number, target: string, alias?: string }

  /** Match a just-closed markdown mark ending at `caret` inside `text` (one text leaf). */
  export function matchInputRule(text: string, caret: number): InputRuleMatch | null

  /** Replace the matched span in `text` with structured inlines; caret after the mark. */
  export function applyInputRule(
    text: string,
    match: InputRuleMatch,
  ): { inlines: InlineNode[], caret: number }
  ```
- Consumes: `InlineNode` from `./types`; build mark nodes directly (do not re-parse the whole line with remark for the matched span).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { applyInputRule, matchInputRule } from './inline-input-rules'

describe('matchInputRule', () => {
  it('matches bold with **', () => {
    expect(matchInputRule('say **hi**', 10)).toEqual({
      kind: 'strong',
      start: 4,
      end: 10,
      content: 'hi',
    })
  })

  it('matches bold with __', () => {
    expect(matchInputRule('__hi__', 6)?.kind).toBe('strong')
  })

  it('matches italic with * without consuming **', () => {
    expect(matchInputRule('x *y*', 5)).toMatchObject({ kind: 'emphasis', content: 'y' })
  })

  it('matches inline code', () => {
    expect(matchInputRule('a `b`', 5)).toMatchObject({ kind: 'inlineCode', content: 'b' })
  })

  it('matches markdown link', () => {
    expect(matchInputRule('[n](https://e.dev)', 18)).toMatchObject({
      kind: 'link',
      content: 'n',
      url: 'https://e.dev',
    })
  })

  it('matches wikilink with alias', () => {
    expect(matchInputRule('[[a|b]]', 7)).toMatchObject({
      kind: 'wikilink',
      target: 'a',
      alias: 'b',
    })
  })

  it('ignores escaped delimiters', () => {
    expect(matchInputRule('a \\*b*', 6)).toBeNull()
  })

  it('returns null when caret is not at end of a match', () => {
    expect(matchInputRule('**hi** there', 12)).toBeNull()
  })
})

describe('applyInputRule', () => {
  it('builds strong inlines and places caret after mark', () => {
    const match = matchInputRule('**hi**', 6)!
    const result = applyInputRule('**hi**', match)
    expect(result.inlines).toEqual([
      { type: 'strong', value: '', children: [{ type: 'text', value: 'hi' }] },
    ])
    expect(result.caret).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter @fluffmind/editor-blocks exec vitest run src/inline-input-rules.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `inline-input-rules.ts`**

Match only suffixes ending at `caret`. Priority order (first match wins): wikilink `[[…]]`, link `[…](…)`, bold `**`/`__`, inline code `` ` ``, italic `*`/`_` (single, not part of `**`/`__`). Reject empty content. Treat `\` before a delimiter as escaped.

`applyInputRule`:  
`before = text.slice(0, match.start)`, `after = text.slice(match.end)` →  
`[{ type:'text', value: before }?, markNode, { type:'text', value: after }?]` (omit empty text nodes).  
Caret = plain length of before + plain length of mark content.

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @fluffmind/editor-blocks exec vitest run src/inline-input-rules.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/editor-blocks/src/inline-input-rules.ts packages/editor-blocks/src/inline-input-rules.test.ts
git commit -m "$(cat <<'EOF'
feat(editor): add markdown inline input-rule matchers

EOF
)"
```

---

### Task 2: `inline-marks` — toggle wrap/unwrap by offsets

**Files:**
- Create: `packages/editor-blocks/src/inline-marks.ts`
- Test: `packages/editor-blocks/src/inline-marks.test.ts`

**Interfaces:**
- Consumes: `inlinesToPlainText` from `./inlines`; `InlineNode` from `./types`
- Produces:
  ```ts
  export type ToggleableMark = 'strong' | 'emphasis' | 'inlineCode'

  export function selectionHasMark(
    inlines: InlineNode[],
    from: number,
    to: number,
    mark: ToggleableMark,
  ): boolean

  export function toggleMark(
    inlines: InlineNode[],
    from: number,
    to: number,
    mark: ToggleableMark,
  ): InlineNode[]

  export function wrapLink(
    inlines: InlineNode[],
    from: number,
    to: number,
    url: string,
  ): InlineNode[]

  export function wrapWikilink(
    inlines: InlineNode[],
    from: number,
    to: number,
    target: string,
    alias?: string,
  ): InlineNode[]
  ```

Offsets are **plain-text** offsets (`inlinesToPlainText` space).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { inlinesToMarkdown } from './inlines'
import { selectionHasMark, toggleMark, wrapLink, wrapWikilink } from './inline-marks'
import type { InlineNode } from './types'

const plain = (value: string): InlineNode[] => [{ type: 'text', value }]

describe('toggleMark', () => {
  it('wraps selection in strong', () => {
    const next = toggleMark(plain('hello'), 0, 5, 'strong')
    expect(inlinesToMarkdown(next)).toBe('**hello**')
  })

  it('unwraps when selection already strong', () => {
    const start: InlineNode[] = [{
      type: 'strong',
      value: '',
      children: [{ type: 'text', value: 'hello' }],
    }]
    expect(selectionHasMark(start, 0, 5, 'strong')).toBe(true)
    expect(inlinesToMarkdown(toggleMark(start, 0, 5, 'strong'))).toBe('hello')
  })

  it('wraps partial text', () => {
    const next = toggleMark(plain('abcdef'), 2, 4, 'emphasis')
    expect(inlinesToMarkdown(next)).toBe('ab*cd*ef')
  })

  it('wraps link and wikilink', () => {
    expect(inlinesToMarkdown(wrapLink(plain('n'), 0, 1, 'https://e.dev'))).toBe('[n](https://e.dev)')
    expect(inlinesToMarkdown(wrapWikilink(plain('n'), 0, 1, 'foam/index'))).toContain('[[foam/index')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter @fluffmind/editor-blocks exec vitest run src/inline-marks.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement splitting + wrap/unwrap**

Algorithm sketch:
1. Flatten walk with plain offsets; split text/mark nodes at `from`/`to`.
2. Extract middle slice as `InlineNode[]`.
3. If `selectionHasMark` → unwrap that mark type from middle (lift children).
4. Else wrap middle in `{ type: mark, value: '', children: middle }` (`inlineCode` uses `value` = joined plain text, no children).
5. Concat left + wrapped + right; merge adjacent `text` nodes.

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @fluffmind/editor-blocks exec vitest run src/inline-marks.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/editor-blocks/src/inline-marks.ts packages/editor-blocks/src/inline-marks.test.ts
git commit -m "$(cat <<'EOF'
feat(editor): toggle inline marks by plain-text offsets

EOF
)"
```

---

### Task 3: `inline-dom` — DOM ↔ `InlineNode[]`

**Files:**
- Create: `packages/editor-blocks/src/inline-dom.ts`
- Test: `packages/editor-blocks/src/inline-dom.test.ts`

**Interfaces:**
- Consumes: `InlineNode` from `./types`; wikilink helpers if needed
- Produces:
  ```ts
  /** Parse a contenteditable root into inline nodes. */
  export function domToInlines(root: HTMLElement): InlineNode[]

  /** Replace root children with a DOM render of inlines (no Vue). */
  export function writeInlinesToDom(root: HTMLElement, inlines: InlineNode[]): void
  ```

DOM mapping:
| DOM | InlineNode |
|-----|------------|
| `#text` | `text` |
| `STRONG` / `B` | `strong` |
| `EM` / `I` | `emphasis` |
| `CODE` | `inlineCode` (`value` only) |
| `A[data-wikilink]` | `wikilink` (`data-target`, optional `data-alias`) |
| `A[href]` (else) | `link` |
| `BR` | `text` with `\n` |

Link/wikilink class names: reuse the same utility classes as `RichInlineNodes.vue` (`text-primary underline …`) so visual parity holds.

- [ ] **Step 1: Write the failing tests**

Use Vitest + happy-dom/jsdom if already available; otherwise create elements via `document` from vitest environment. Check `packages/editor-blocks` vitest config — if no DOM env, add to that test file:

```ts
// @vitest-environment happy-dom
```

If `happy-dom` is missing, add it as a devDependency of `@fluffmind/editor-blocks` in this task.

```ts
import { describe, expect, it } from 'vitest'
import { domToInlines, writeInlinesToDom } from './inline-dom'
import { inlinesToMarkdown } from './inlines'
import type { InlineNode } from './types'

describe('inline-dom', () => {
  it('round-trips bold + text', () => {
    const root = document.createElement('div')
    const inlines: InlineNode[] = [
      { type: 'text', value: 'a' },
      { type: 'strong', value: '', children: [{ type: 'text', value: 'b' }] },
    ]
    writeInlinesToDom(root, inlines)
    expect(root.querySelector('strong')?.textContent).toBe('b')
    expect(inlinesToMarkdown(domToInlines(root))).toBe('a**b**')
  })

  it('round-trips link and wikilink', () => {
    const root = document.createElement('div')
    writeInlinesToDom(root, [
      { type: 'link', value: '', url: 'https://e.dev', children: [{ type: 'text', value: 'n' }] },
      { type: 'text', value: ' ' },
      { type: 'wikilink', value: '', target: 'foam/index', alias: 'Home' },
    ])
    const back = domToInlines(root)
    expect(inlinesToMarkdown(back)).toContain('[n](https://e.dev)')
    expect(inlinesToMarkdown(back)).toContain('[[foam/index|Home]]')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter @fluffmind/editor-blocks exec vitest run src/inline-dom.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `inline-dom.ts`**

`writeInlinesToDom`: `root.replaceChildren()` then append nodes recursively.  
`domToInlines`: walk `childNodes`; ignore empty text if needed; for `A`, prefer `dataset.wikilink === 'true'`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @fluffmind/editor-blocks exec vitest run src/inline-dom.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/editor-blocks/src/inline-dom.ts packages/editor-blocks/src/inline-dom.test.ts packages/editor-blocks/package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(editor): map InlineNode trees to contenteditable DOM

EOF
)"
```

---

### Task 4: `InlineFormatToolbar` bubble

**Files:**
- Create: `packages/editor-blocks/src/components/InlineFormatToolbar.vue`

**Interfaces:**
- Props:
  ```ts
  {
    open: boolean
    anchorRect: DOMRect | null
    active: { strong: boolean, emphasis: boolean, inlineCode: boolean, link: boolean, wikilink: boolean }
  }
  ```
- Emits: `toggleStrong`, `toggleEmphasis`, `toggleInlineCode`, `link`, `wikilink`, `mousedown` prevented on bar (keep selection)

- [ ] **Step 1: Implement toolbar UI**

Mirror `SlashMenu.vue` Teleport + `fixed z-50` positioning from `anchorRect` (prefer **above** selection: `top = anchorRect.top - 40`).

Buttons (French labels ok): `Gras`, `Italique`, `Code`, `Lien`, `Wikilink`.  
Active → `md3-nav-item-active` or `aria-pressed="true"` + stronger weight.

- [ ] **Step 2: Smoke via typecheck**

Run: `pnpm --filter @fluffmind/editor-blocks run typecheck`  
Expected: PASS (component may be unused until Task 5)

- [ ] **Step 3: Commit**

```bash
git add packages/editor-blocks/src/components/InlineFormatToolbar.vue
git commit -m "$(cat <<'EOF'
feat(editor): add inline format selection toolbar shell

EOF
)"
```

---

### Task 5: `InlineRichSurface` — contenteditable + rules + shortcuts + toolbar

**Files:**
- Create: `packages/editor-blocks/src/components/InlineRichSurface.vue`
- Modify: `packages/editor-blocks/src/components/InlineEditable.vue` (optional thin wrapper delegating to `InlineRichSurface` to reduce block churn — prefer direct rename in Task 6)

**Interfaces (props/emits — match current `InlineEditable`):**
```ts
props: {
  inlines: InlineNode[]
  placeholder?: string
  textClass?: string
  multiline?: boolean
}
emits: {
  'update:inlines': [InlineNode[]]
  enter: [offset: number]
  shiftEnter: [offset: number]
  tab: []
  shiftTab: []
  backspaceEmpty: []
  deleteBlock: []
  slashChange: [{ active: boolean, query: string, rect: DOMRect | null }]
  blur: []
  focus: []
}
expose: { focus(offset?: number), getOffset(): number }
```

**Behavior:**
1. On mount / when `inlines` change **and surface not focused**: `writeInlinesToDom`.
2. On `input`:  
   - `inlines = domToInlines(root)`  
   - Detect current text leaf + caret local offset → `fullLeafText` + caret  
   - `match = matchInputRule(leafText, localCaret)`  
   - If match: rebuild that leaf’s contribution via `applyInputRule`, splice into full inlines (simplest v1: if root is mostly one text flow, apply on `root.innerText` + `getSelectionOffset` then `writeInlinesToDom` + `setSelectionOffset`)  
   - Prefer v1 simplification documented below if leaf splicing is hard.
3. Emit `update:inlines` after each committed change.
4. Selectionchange / mouseup / keyup: if selection non-collapsed inside root → open toolbar with `getBoundingClientRect()` of range; else close.
5. Shortcuts: `metaKey|ctrlKey` + B/I/E/K → `toggleMark` / link prompt.
6. Link click: if click on `a` and selection collapsed → `preventDefault` only when meta/ctrl? Spec: plain click navigates — use `click` on `a` with `@click` stop only when editing caret inside? **Implement:** collapsed caret + click on `a` → allow default navigation; if user is selecting, no navigate. Use `mousedown` on links with `event.metaKey` optional new-tab — keep `target` unset for wikilinks (`href=/notes/...`) same as today.
7. Slash: run `matchSlashQuery(inlinesToMarkdown(domToInlines(...))` **or** on plain text of block — reuse `matchSlashQuery` from `slash-commands.ts` on `root.innerText` when it looks like leading `/`.
8. Enter / Shift+Enter / Backspace empty / Delete block: same as `EditableSurface.vue`.
9. Skip input rules while `event.isComposing` (IME).

**v1 input-rule simplification (allowed):**  
On each input, take `text = root.innerText` and `caret = getSelectionOffset(root)`. If `matchInputRule(text, caret)` hits, then:

```ts
const { inlines, caret } = applyInputRule(text, match)
// PROBLEM: destroys existing marks already in DOM
```

So **do not** use full-innerText apply when `domToInlines` already contains non-text marks. Instead:

```ts
const current = domToInlines(root)
const plain = inlinesToPlainText(current)
// Only run matchInputRule when current is all-text OR match range lies inside a single top-level text node.
```

Implement helper `tryApplyInputRuleToInlines(inlines, caret): { inlines, caret } | null` in `inline-input-rules.ts` that:
1. Finds the top-level text node covering caret.
2. Maps caret → offset within that node’s `value`.
3. Runs `matchInputRule` on that value only.
4. Replaces that text node with `applyInputRule(...).inlines`.

Add tests for this helper in Task 5 or extend Task 1 file.

- [ ] **Step 1: Add `tryApplyInputRuleToInlines` tests + impl** in `inline-input-rules.ts`

```ts
it('applies bold inside longer text node without touching neighbors', () => {
  const inlines: InlineNode[] = [
    { type: 'strong', value: '', children: [{ type: 'text', value: 'A' }] },
    { type: 'text', value: ' **B**' },
  ]
  // caret at end → plain length 1 + 5 = 6
  const result = tryApplyInputRuleToInlines(inlines, 6)
  expect(result).not.toBeNull()
  expect(inlinesToMarkdown(result!.inlines)).toBe('**A****B**') // or '**A** **B**' depending on space handling — assert structure with kinds
})
```

Fix expectation to match real spacing: text node is `' **B**'` → after apply `' '` + strong B → markdown `**A** **B**`.

- [ ] **Step 2: Implement `InlineRichSurface.vue`**

Wire DOM, rules, toolbar, shortcuts, slash, keyboard. Use `window.prompt` for URL / wikilink target in v1 (acceptable; replace later).

- [ ] **Step 3: Typecheck + unit tests**

Run:
```bash
pnpm --filter @fluffmind/editor-blocks run test
pnpm --filter @fluffmind/editor-blocks run typecheck
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/editor-blocks/src/components/InlineRichSurface.vue packages/editor-blocks/src/inline-input-rules.ts packages/editor-blocks/src/inline-input-rules.test.ts
git commit -m "$(cat <<'EOF'
feat(editor): InlineRichSurface with input rules and format toolbar

EOF
)"
```

---

### Task 6: Migrate text blocks off preview/markdown toggle

**Files:**
- Modify: `packages/editor-blocks/src/components/blocks/ParagraphBlock.vue`
- Modify: `packages/editor-blocks/src/components/blocks/HeadingBlock.vue`
- Modify: `packages/editor-blocks/src/components/blocks/ListBlock.vue`
- Modify: `packages/editor-blocks/src/components/blocks/TaskListBlock.vue`
- Modify: `packages/editor-blocks/src/components/blocks/BlockquoteBlock.vue`
- Modify: `packages/editor-blocks/src/components/blocks/CalloutBlock.vue`
- Modify or delete: `packages/editor-blocks/src/components/InlineEditable.vue`

- [ ] **Step 1: Replace imports**

In each block file, replace:

```ts
import InlineEditable from '../InlineEditable.vue'
// ...
const surface = ref<InstanceType<typeof InlineEditable> | null>(null)
```

with:

```ts
import InlineRichSurface from '../InlineRichSurface.vue'
// ...
const surface = ref<InstanceType<typeof InlineRichSurface> | null>(null)
```

Template: `<InlineEditable` → `<InlineRichSurface` (keep the same props/emits including `tab` / `shift-tab` on lists).

- [ ] **Step 2: Remove or slim `InlineEditable.vue`**

Delete file if unused; grep to confirm. Keep `RichInlineView` / `RichInlineNodes` only if still referenced.

- [ ] **Step 3: Run full package tests + typecheck**

```bash
pnpm --filter @fluffmind/editor-blocks run test
pnpm --filter @fluffmind/editor-blocks run typecheck
```
Expected:  all PASS (existing round-trips unchanged)

- [ ] **Step 4: Commit**

```bash
git add packages/editor-blocks/src/components
git commit -m "$(cat <<'EOF'
feat(editor): edit text blocks in styled rich surface

EOF
)"
```

---

### Task 7: Manual verification + portable smoke

**Files:** none (verification only); optional note in spec status.

- [ ] **Step 1: Run web locally or rebuild portable**

```bash
pnpm --filter @fluffmind/web run dev
# or
pnpm portable:stop; pnpm package:portable -- --target current; pnpm portable:start
```

- [ ] **Step 2: Manual checklist**

1. Type `**bold**` → becomes bold, caret after, no raw markdown mode.  
2. Type `` `code` `` → inline code.  
3. Select word → toolbar appears; Gras toggles.  
4. `Cmd+B` / `Cmd+I` work.  
5. `Cmd+K` prompts URL and wraps link.  
6. Type `[[foam/index]]` → wikilink; click navigates when caret collapsed.  
7. Slash `/` still opens block menu.  
8. Enter still splits blocks; lists Tab/Shift+Tab still work.  
9. Save note; reopen in source view — markdown delimiters present, Obsidian-readable.

- [ ] **Step 3: Commit any fixes** (if needed) with `fix(editor): …`

- [ ] **Step 4: Final commit only if docs need a “implemented” note** — optional; skip if no doc churn.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Edit inside styled render | 5, 6 |
| Input rules `**` `__` `*` `_` `` ` `` link wikilink | 1, 5 |
| Skip escapes / no rule inside code | 1 (match), 5 (skip when caret in inlineCode leaf) |
| Toolbar on selection only | 4, 5 |
| Shortcuts B/I/E/K | 5 |
| Link/wikilink prompts | 5 |
| Clickable links when collapsed | 5 |
| No TipTap | Global |
| Markdown round-trip | 2, 3, 6 + existing tests |
| Soft-undo | Explicitly skipped (follow-up) |
| ADR/PRD/DESIGN already updated | Done in brainstorm commit |

## Placeholder scan

No TBD steps; APIs named consistently (`matchInputRule`, `applyInputRule`, `tryApplyInputRuleToInlines`, `toggleMark`, `domToInlines`, `writeInlinesToDom`).
