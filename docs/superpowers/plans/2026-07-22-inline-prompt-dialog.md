# Inline Prompt Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `window.prompt()` for link/wikilink in the block editor with a Reka-based `PromptDialog` owned by `apps/web`, via an event + expose round-trip on `BlockEditor`.

**Architecture:** A small pure controller in `editor-blocks` manages one pending Promise. `BlockEditor` provides `requestInlinePrompt` through context and emits `inline-prompt`; note pages open `PromptDialog` (renamed from `RenameDialog`) and call `confirmInlinePrompt`. Surfaces keep the captured selection range across the await.

**Tech Stack:** Vue 3 `<script setup>`, existing `FluffmindDialog` / `FluffmindTextField` (Reka UI), Vitest, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-22-inline-prompt-dialog-design.md`

## Global Constraints

- Do **not** add `@fluffmind/design-system` or `reka-ui` to `packages/editor-blocks`.
- No native `window.prompt` / `alert` / `confirm` fallback when context is missing — no-op.
- Last `requestInlinePrompt` wins; prior pending Promise resolves `null`.
- Vue components: `<script setup lang="ts>` + typed props (Anthony Fu style).
- Code comments in English; UI copy in French (match existing).
- Conventional Commits: `feat(editor): …`, `refactor(web): …`, `test(editor): …`.
- Package tests: `pnpm --filter @fluffmind/editor-blocks run test`
- Typecheck editor: `pnpm --filter @fluffmind/editor-blocks run typecheck`
- Typecheck web: `pnpm --filter @fluffmind/web run typecheck`

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/editor-blocks/src/inline-prompt.ts` | Pure pending-Promise controller |
| `packages/editor-blocks/src/inline-prompt.test.ts` | Unit tests for controller |
| `packages/editor-blocks/src/block-editor-context.ts` | Add `requestInlinePrompt` to context type |
| `packages/editor-blocks/src/components/BlockEditor.vue` | Wire controller, emit, expose, provide, unmount cleanup |
| `packages/editor-blocks/src/components/InlineRichSurface.vue` | Replace `window.prompt` with injected request |
| `apps/web/app/components/PromptDialog.vue` | Renamed from `RenameDialog.vue` (+ optional `confirmLabel`) |
| `apps/web/app/components/VaultSidebar.vue` | Use `PromptDialog` |
| `apps/web/app/pages/notes/[...slug].vue` | Host dialog + round-trip |
| `apps/web/app/pages/notes/new.vue` | Host dialog + round-trip |

---

### Task 1: `inline-prompt` controller (TDD)

**Files:**
- Create: `packages/editor-blocks/src/inline-prompt.ts`
- Create: `packages/editor-blocks/src/inline-prompt.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type InlinePromptKind = 'link' | 'wikilink'

  export interface InlinePromptController {
    request: (kind: InlinePromptKind) => Promise<string | null>
    confirm: (value: string | null) => void
    dispose: () => void
  }

  export function createInlinePromptController(
    onRequest: (kind: InlinePromptKind) => void,
  ): InlinePromptController
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from 'vitest'

import { createInlinePromptController } from './inline-prompt'

describe('createInlinePromptController', () => {
  it('emits on request and resolves on confirm', async () => {
    const onRequest = vi.fn()
    const ctrl = createInlinePromptController(onRequest)
    const pending = ctrl.request('link')
    expect(onRequest).toHaveBeenCalledWith('link')
    ctrl.confirm('https://example.com')
    await expect(pending).resolves.toBe('https://example.com')
  })

  it('cancels previous pending with null when a new request starts', async () => {
    const ctrl = createInlinePromptController(() => {})
    const first = ctrl.request('link')
    const second = ctrl.request('wikilink')
    await expect(first).resolves.toBeNull()
    ctrl.confirm('note-a')
    await expect(second).resolves.toBe('note-a')
  })

  it('dispose resolves pending with null', async () => {
    const ctrl = createInlinePromptController(() => {})
    const pending = ctrl.request('link')
    ctrl.dispose()
    await expect(pending).resolves.toBeNull()
  })

  it('confirm is a no-op when nothing is pending', () => {
    const ctrl = createInlinePromptController(() => {})
    expect(() => ctrl.confirm('x')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter @fluffmind/editor-blocks exec vitest run src/inline-prompt.test.ts`

Expected: FAIL (module not found / export missing)

- [ ] **Step 3: Implement controller**

```ts
export type InlinePromptKind = 'link' | 'wikilink'

export interface InlinePromptController {
  request: (kind: InlinePromptKind) => Promise<string | null>
  confirm: (value: string | null) => void
  dispose: () => void
}

export function createInlinePromptController(
  onRequest: (kind: InlinePromptKind) => void,
): InlinePromptController {
  let resolvePending: ((value: string | null) => void) | null = null

  function settle(value: string | null) {
    const resolve = resolvePending
    resolvePending = null
    resolve?.(value)
  }

  return {
    request(kind) {
      settle(null)
      return new Promise<string | null>((resolve) => {
        resolvePending = resolve
        onRequest(kind)
      })
    },
    confirm(value) {
      settle(value)
    },
    dispose() {
      settle(null)
    },
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @fluffmind/editor-blocks exec vitest run src/inline-prompt.test.ts`

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add \
  docs/superpowers/specs/2026-07-22-inline-prompt-dialog-design.md \
  packages/editor-blocks/src/inline-prompt.ts \
  packages/editor-blocks/src/inline-prompt.test.ts
git commit -m "$(cat <<'EOF'
feat(editor): add inline prompt controller for link dialogs

EOF
)"
```

---

### Task 2: Wire controller into `BlockEditor` + context

**Files:**
- Modify: `packages/editor-blocks/src/block-editor-context.ts`
- Modify: `packages/editor-blocks/src/components/BlockEditor.vue`

**Interfaces:**
- Consumes: `createInlinePromptController`, `InlinePromptKind` from `../inline-prompt`
- Produces (context):
  ```ts
  requestInlinePrompt: (kind: InlinePromptKind) => Promise<string | null>
  ```
- Produces (component):
  ```ts
  emit('inline-prompt', { kind: InlinePromptKind })
  defineExpose({ confirmInlinePrompt(value: string | null): void })
  ```

- [ ] **Step 1: Extend context type**

In `block-editor-context.ts`, add import and field:

```ts
import type { InlinePromptKind } from './inline-prompt'

export interface BlockEditorContext {
  blockIndex: Ref<number | null>
  blocks: Ref<BlockNode[]>
  registerSurface: (blockId: string, surface: { focus: (offset?: number) => void, getOffset: () => number }) => void
  unregisterSurface: (blockId: string) => void
  vaultNotes: Ref<Array<{ id: string, title: string }>>
  requestInlinePrompt: (kind: InlinePromptKind) => Promise<string | null>
}
```

- [ ] **Step 2: Wire BlockEditor**

Near the top of `<script setup>` in `BlockEditor.vue` (after existing imports), add:

```ts
import { createInlinePromptController, type InlinePromptKind } from '../inline-prompt'
```

After other refs, before `provide(...)`:

There is currently **no** `defineEmits` / `defineExpose` on `BlockEditor.vue`. Add:

```ts
const emit = defineEmits<{
  'inline-prompt': [payload: { kind: InlinePromptKind }]
}>()

const inlinePrompt = createInlinePromptController((kind) => {
  emit('inline-prompt', { kind })
})
```

Extend the existing `provide(blockEditorContextKey, { ... })` object with:

```ts
requestInlinePrompt: inlinePrompt.request,
```

Merge into the **existing** `onUnmounted` (do not add a second one):

```ts
onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  suppressBlurPromotion.value = true
  blocks.value = stripTrailingEmptyBlocks(blocks.value)
  inlinePrompt.dispose()
})
```

At the end of script, expose:

```ts
defineExpose({
  confirmInlinePrompt(value: string | null) {
    inlinePrompt.confirm(value)
  },
})
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @fluffmind/editor-blocks run typecheck`

Expected: PASS (or only pre-existing errors unrelated to this change)

- [ ] **Step 4: Commit**

```bash
git add \
  packages/editor-blocks/src/block-editor-context.ts \
  packages/editor-blocks/src/components/BlockEditor.vue
git commit -m "$(cat <<'EOF'
feat(editor): expose inline-prompt round-trip on BlockEditor

EOF
)"
```

---

### Task 3: Replace `window.prompt` in `InlineRichSurface`

**Files:**
- Modify: `packages/editor-blocks/src/components/InlineRichSurface.vue`

**Interfaces:**
- Consumes: `inject(blockEditorContextKey)` → `requestInlinePrompt`
- Produces: async `promptLink` / `promptWikilink` with no native prompt

- [ ] **Step 1: Inject context**

Add imports:

```ts
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { blockEditorContextKey } from '../block-editor-context'
```

After props/emits:

```ts
const editor = inject(blockEditorContextKey, null)
```

- [ ] **Step 2: Replace prompt helpers**

Replace `promptLink` and `promptWikilink` with:

```ts
async function promptLink() {
  if (!root.value || !editor) return
  const plainRange = getPlainSelectionRange(root.value)
  if (!plainRange || plainRange.from === plainRange.to) return
  const url = await editor.requestInlinePrompt('link')
  if (!url || !root.value) return
  const current = domToInlines(root.value)
  const next = wrapLink(current, plainRange.from, plainRange.to, url)
  writeDom(next)
  nextTick(() => setSelectionOffset(root.value!, plainRange.to))
  emitInlines(next)
  toolbarOpen.value = false
}

async function promptWikilink() {
  if (!root.value || !editor) return
  const plainRange = getPlainSelectionRange(root.value)
  if (!plainRange || plainRange.from === plainRange.to) return
  const target = await editor.requestInlinePrompt('wikilink')
  if (!target || !root.value) return
  const current = domToInlines(root.value)
  const next = wrapWikilink(current, plainRange.from, plainRange.to, target)
  writeDom(next)
  nextTick(() => setSelectionOffset(root.value!, plainRange.to))
  emitInlines(next)
  toolbarOpen.value = false
}
```

Keep template bindings `@link="promptLink"` / `@wikilink="promptWikilink"` and the Cmd/Ctrl+K handler calling `promptLink()` (async without await is fine).

- [ ] **Step 3: Grep for leftover native prompts**

Run: `rg "window\\.prompt|window\\.alert" packages/editor-blocks`

Expected: no matches

- [ ] **Step 4: Run package tests + typecheck**

Run:

```bash
pnpm --filter @fluffmind/editor-blocks run test
pnpm --filter @fluffmind/editor-blocks run typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/editor-blocks/src/components/InlineRichSurface.vue
git commit -m "$(cat <<'EOF'
feat(editor): request link/wikilink values via BlockEditor context

EOF
)"
```

---

### Task 4: Rename `RenameDialog` → `PromptDialog`

**Files:**
- Create: `apps/web/app/components/PromptDialog.vue` (content from RenameDialog + `confirmLabel`)
- Delete: `apps/web/app/components/RenameDialog.vue`
- Modify: `apps/web/app/components/VaultSidebar.vue`

**Interfaces:**
- Produces:
  ```ts
  // PromptDialog props
  open: boolean // v-model:open
  title?: string
  description?: string
  initialValue?: string
  placeholder?: string
  confirmLabel?: string // default 'Valider'
  // emit
  confirm: [value: string]
  ```

- [ ] **Step 1: Add `PromptDialog.vue`**

```vue
<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindDialog,
  FluffmindTextField,
} from '@fluffmind/design-system/src/components'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  title?: string
  description?: string
  initialValue?: string
  placeholder?: string
  confirmLabel?: string
}>()

const emit = defineEmits<{
  confirm: [value: string]
}>()

const value = ref('')

watch(open, (isOpen) => {
  if (isOpen) {
    value.value = props.initialValue ?? ''
  }
})

function submit() {
  const trimmed = value.value.trim()
  if (!trimmed) return
  emit('confirm', trimmed)
  open.value = false
}
</script>

<template>
  <FluffmindDialog
    :open="open"
    :title="title ?? 'Renommer'"
    :description="description"
    @update:open="open = $event"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <FluffmindTextField
        v-model="value"
        :placeholder="placeholder ?? 'Nouveau nom'"
      />
      <div class="flex justify-end gap-2">
        <FluffmindButton variant="text" type="button" @click="open = false">
          Annuler
        </FluffmindButton>
        <FluffmindButton type="submit" :disabled="!value.trim()">
          {{ confirmLabel ?? 'Valider' }}
        </FluffmindButton>
      </div>
    </form>
  </FluffmindDialog>
</template>
```

- [ ] **Step 2: Update VaultSidebar**

Replace:

```vue
    <RenameDialog
      v-model:open="renameOpen"
      :initial-value="renameInitialValue"
      :description="renameTarget?.kind === 'folder' ? 'Nouveau nom pour ce dossier.' : 'Nouveau titre pour cette note (utilisé comme identifiant).'"
      @confirm="confirmRename"
    />
```

with:

```vue
    <PromptDialog
      v-model:open="renameOpen"
      :initial-value="renameInitialValue"
      :description="renameTarget?.kind === 'folder' ? 'Nouveau nom pour ce dossier.' : 'Nouveau titre pour cette note (utilisé comme identifiant).'"
      @confirm="confirmRename"
    />
```

Nuxt auto-imports components by filename — no explicit import required if none existed.

- [ ] **Step 3: Delete `RenameDialog.vue`**

```bash
rm apps/web/app/components/RenameDialog.vue
```

- [ ] **Step 4: Grep for RenameDialog**

Run: `rg "RenameDialog" apps/web`

Expected: no matches

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/PromptDialog.vue apps/web/app/components/VaultSidebar.vue
git add -u apps/web/app/components/RenameDialog.vue
git commit -m "$(cat <<'EOF'
refactor(web): rename RenameDialog to PromptDialog

EOF
)"
```

---

### Task 5: Host `PromptDialog` on note pages

**Files:**
- Modify: `apps/web/app/pages/notes/[...slug].vue`
- Modify: `apps/web/app/pages/notes/new.vue`

**Interfaces:**
- Consumes: `BlockEditor` emit `inline-prompt`, expose `confirmInlinePrompt`
- Consumes: `PromptDialog`

Shared page logic (identical on both pages):

```ts
const editorRef = ref<{ confirmInlinePrompt: (value: string | null) => void } | null>(null)
const inlinePromptOpen = ref(false)
const inlinePromptKind = ref<'link' | 'wikilink'>('link')

const inlinePromptTitle = computed(() =>
  inlinePromptKind.value === 'link' ? 'URL du lien' : 'Cible du wikilink',
)
const inlinePromptPlaceholder = computed(() =>
  inlinePromptKind.value === 'link' ? 'https://…' : 'chemin de la note',
)

function onInlinePrompt(payload: { kind: 'link' | 'wikilink' }) {
  inlinePromptKind.value = payload.kind
  inlinePromptOpen.value = true
}

function onInlinePromptConfirm(value: string) {
  editorRef.value?.confirmInlinePrompt(value)
}

watch(inlinePromptOpen, (open) => {
  if (!open) {
    // Closing without confirm still settles the pending Promise.
    // confirmInlinePrompt is idempotent when already settled by submit.
    editorRef.value?.confirmInlinePrompt(null)
  }
})
```

**Watch caveat:** submitting sets `open = false` inside `PromptDialog` *after* emitting `confirm`. Order in `PromptDialog.submit`:

1. `emit('confirm', trimmed)`
2. `open.value = false`

So the page must settle the success path in `@confirm` **before** the `watch` runs with `null`. That works if `@confirm` calls `confirmInlinePrompt(value)` first: controller clears pending, then watch's `confirmInlinePrompt(null)` is a no-op. Do **not** reverse that order.

Template additions:

```vue
<BlockEditor
  ref="editorRef"
  ...existing props...
  @inline-prompt="onInlinePrompt"
/>

<PromptDialog
  v-model:open="inlinePromptOpen"
  :title="inlinePromptTitle"
  :placeholder="inlinePromptPlaceholder"
  @confirm="onInlinePromptConfirm"
/>
```

- [ ] **Step 1: Wire `[...slug].vue`**

Add the shared script block above (adapt imports: Nuxt auto-imports `ref`/`computed`/`watch`). Attach `ref` + `@inline-prompt` on the existing `BlockEditor`, add `PromptDialog` next to other dialogs/panels at the end of `<main>` / template.

- [ ] **Step 2: Wire `new.vue`**

Same wiring on the existing `<BlockEditor v-model="blocks" />`.

- [ ] **Step 3: Typecheck web**

Run: `pnpm --filter @fluffmind/web run typecheck`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add \
  apps/web/app/pages/notes/\[...slug\].vue \
  apps/web/app/pages/notes/new.vue
git commit -m "$(cat <<'EOF'
feat(web): host PromptDialog for editor link and wikilink prompts

EOF
)"
```

---

### Task 6: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start app** (if not already)

Run: `pnpm --filter @fluffmind/web run dev`

- [ ] **Step 2: Checklist**

| Check | Expected |
|-------|----------|
| Select text → toolbar link | `PromptDialog` opens with title « URL du lien » |
| Submit URL | Selection becomes a link; dialog closes |
| Cancel / overlay close | No link applied |
| Cmd/Ctrl+K with selection | Same as toolbar link |
| Toolbar wikilink | Title « Cible du wikilink »; wrap applies |
| Sidebar rename note/folder | Still works via `PromptDialog` |
| No `window.prompt` | Browser never shows native prompt |

- [ ] **Step 3: Final commit only if verification found fixes**

If fixes were needed, commit them with a focused message (e.g. `fix(web): settle inline prompt on dialog close`). Otherwise no commit.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Pure pending controller / last-wins | Task 1 |
| Context `requestInlinePrompt` | Task 2 |
| Emit `inline-prompt` + `confirmInlinePrompt` | Task 2 |
| Unmount disposes pending | Task 2 (`dispose` in `onUnmounted`) |
| Surface uses inject; captures range before await | Task 3 |
| No native prompt fallback | Task 3 |
| Rename `RenameDialog` → `PromptDialog` | Task 4 |
| VaultSidebar still renames | Task 4 |
| Host on slug + new pages | Task 5 |
| Manual link/wikilink/cancel/rename | Task 6 |
| No design-system dep in editor-blocks | Global + Tasks 1–3 |
| Autocomplete / prefill / i18n out of scope | — (intentionally omitted) |
