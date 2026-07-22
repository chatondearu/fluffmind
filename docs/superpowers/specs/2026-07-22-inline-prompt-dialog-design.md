# Inline link/wikilink prompt dialog

**Date:** 2026-07-22  
**Status:** approved (product design)  
**Scope:** replace `window.prompt()` in the block editor with a Reka-based dialog owned by `apps/web`

## Problem

`InlineRichSurface` uses native `window.prompt()` for link URLs (toolbar + Cmd/Ctrl+K) and wikilink targets. Native prompts are inconsistent with the MD3 UI, block focus/selection awkwardly, and are the last native modal surface in the editor path.

`FluffmindDialog` (Reka UI) and form dialogs already exist in the design system / web app. There is no `alert()` usage left in the repo.

## Goals

1. Replace both `window.prompt()` call sites with a themed dialog.
2. Keep `@fluffmind/editor-blocks` free of `@fluffmind/design-system` / Reka UI.
3. Reuse the existing text-prompt dialog pattern; rename `RenameDialog` → `PromptDialog` so rename + link/wikilink share one component.
4. Preserve wrap behavior (`wrapLink` / `wrapWikilink`) and caret restoration inside the surface.

## Non-goals

- Wikilink autocomplete from `vaultNotes`
- Prefill / edit existing link or wikilink href
- i18n
- Programmatic `useAlert()` / global toast layer
- Adding design-system dependency to `editor-blocks`

## Decisions

| Topic | Choice |
| ----- | ------ |
| Placement of dialog UI | `apps/web` only |
| Round-trip API | Event + `expose` on `BlockEditor` (approach 1) |
| Surface → editor wiring | `provide/inject` via `BlockEditorContext` |
| Dialog component | Rename `RenameDialog` → `PromptDialog` |
| Missing context | No-op (no native `prompt` fallback) |
| Pages wired | `notes/[...slug].vue` and `notes/new.vue` |

## Architecture

```
InlineRichSurface
  → inject requestInlinePrompt(kind)
       → BlockEditor (pending Promise)
            → emit('inline-prompt', { kind })
                 → page opens PromptDialog
            ← confirmInlinePrompt(value | null)  // expose
  ← resolve Promise
  → wrapLink / wrapWikilink if non-empty
```

`editor-blocks` never imports Vue dialog components from the design system. `apps/web` owns presentation.

## Components & API

### `PromptDialog` (`apps/web`)

File rename: `RenameDialog.vue` → `PromptDialog.vue`. Update `VaultSidebar.vue` import/usage.

| Prop / emit | Type | Notes |
| ----------- | ---- | ----- |
| `open` | `v-model:open` boolean | |
| `title?` | string | |
| `description?` | string | |
| `initialValue?` | string | reset when opened |
| `placeholder?` | string | |
| `confirmLabel?` | string | default « Valider » |
| `confirm` | `[value: string]` | trimmed non-empty only |

UI: existing `FluffmindDialog` + `FluffmindTextField` + Annuler / Valider (unchanged behavior).

### `BlockEditorContext`

Extend with:

```ts
requestInlinePrompt: (kind: 'link' | 'wikilink') => Promise<string | null>
```

### `BlockEditor`

- Implements `requestInlinePrompt`: store a single pending resolver, emit `inline-prompt` with `{ kind }`.
- If a prompt is already pending, reject/cancel the previous with `null` before starting the new one (last request wins).
- `defineExpose({ confirmInlinePrompt(value: string | null): void })` resolves the pending Promise.
- Closing the dialog without confirm must call `confirmInlinePrompt(null)`.

### `InlineRichSurface`

- `promptLink` / `promptWikilink` become async: capture `plainRange`, `await requestInlinePrompt(...)`, apply wrap if truthy, restore caret, close toolbar.
- If `requestInlinePrompt` is missing from inject context: return early (no-op).

### Pages (`apps/web`)

On `@inline-prompt`:

| `kind` | Dialog title | Placeholder |
| ------ | ------------ | ----------- |
| `link` | URL du lien | `https://…` |
| `wikilink` | Cible du wikilink | chemin de la note |

Wire both `notes/[...slug].vue` and `notes/new.vue`.

## Data flow (happy path)

1. User selects text → toolbar « link » or Cmd/Ctrl+K (or wikilink action).
2. Surface stores `plainRange`, calls `requestInlinePrompt('link' | 'wikilink')`.
3. `BlockEditor` emits `inline-prompt`; page sets dialog copy and `open = true`.
4. User submits → page calls `editorRef.confirmInlinePrompt(trimmed)`.
5. Surface applies wrap, restores selection to `plainRange.to`, closes toolbar.
6. Cancel / overlay close → `confirmInlinePrompt(null)` → surface leaves content unchanged.

## Error handling & edge cases

- Empty submit: `PromptDialog` already blocks submit when trimmed value is empty.
- Blur of contenteditable while dialog is open: surface must keep the captured range in local state (not re-read selection after await).
- Concurrent prompts: last `requestInlinePrompt` wins; prior Promise resolves `null`.
- Editor unmounted while pending: `BlockEditor` `onBeforeUnmount` calls the pending resolver with `null`. A surface that unmounts mid-prompt simply never applies the result (Promise may still resolve; wrap is gated on `root` still existing).

## Testing

- Unit: no new requirement for dialog DOM; existing `wrapLink` / `wrapWikilink` tests stay.
- Manual: Cmd+K link, toolbar link, toolbar wikilink, cancel, rename via sidebar still works with `PromptDialog`.

## Out of scope follow-ups

- Note picker / autocomplete for wikilink targets using `vaultNotes`.
- Shared composable `useInlinePromptDialog()` if more host pages appear.
