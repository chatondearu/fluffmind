# PLAN-029 — Vault sidebar navigation

- **Status**: shipped
- **PRD**: [[../prd/PRD-029-vault-sidebar-navigation|PRD-029]]
- **Date**: 2026-07-11
- **Shipped**: 2026-07-11 — PR [#95](https://github.com/chatondearu/fluffmind/pull/95)

## Summary

Add a persistent left sidebar that renders the vault as a folder/page tree (derived from
note ids), integrated into a two-column app shell. Home (`/`) keeps its flat list.
New pages support `?folder=` prefix. Mobile uses an overlay drawer.

## Constraints (from ADRs)

| ADR | Constraint |
| --- | ---------- |
| [[../foam/decisions/ADR-001-markdown-git-source-of-truth|ADR-001]] | Folders are path prefixes in Git — no folder CRUD without a note file |
| ADR-002 | Navigation is read-only; writes still via `writeToWorkspace` |

## Scope

### In scope

- Client-side vault tree builder + unit tests
- `VaultSidebar.vue` (tree, expand/collapse, active route, new page CTA)
- Two-column `app.vue` layout; sidebar hidden on auth public routes
- Mobile overlay drawer (backdrop + toggle in header)
- `localStorage` expand state keyed by workspace id (`default` when auth off)
- `?folder=` on `/notes/new` → prefix autosaved note id
- Refresh sidebar after note create/autosave (`refreshNuxtData('/api/notes')`)

### Out of scope

- Move/rename notes via drag-and-drop (later: PRD-030 rename/delete APIs + `⋯` menu)
- Empty folder creation (later: PRD-030 `POST /api/folders`)
- Sidebar search
- Keyboard tree navigation (v1.1)

## Technical approach

### 1. Tree builder (`apps/web/app/utils/vault-tree.ts`)

```typescript
interface VaultTreeNode {
  kind: 'folder' | 'page'
  name: string        // segment label (last path part for pages)
  path: string        // folder path or full note id for pages
  noteId?: string     // set when kind === 'page'
  href: string        // /notes/:id or /boards/:id
  children: VaultTreeNode[]
}
```

- Input: `NoteSummary[]` from `/api/notes`
- For each note, walk id segments; create folder nodes as needed; attach leaf page node
- Use `isKanbanBoard(frontmatter)` for `href`
- Sort each level: folders first, then pages, `localeCompare`

### 2. Composable (`useVaultTree.ts`)

- Wrap `useFetch('/api/notes')` (shared key for refresh)
- `tree` computed from notes
- `expandedPaths: Ref<Set<string>>` hydrated from `localStorage`
- `toggleFolder(path)`, `isExpanded(path)`
- `refresh()` → `refreshNuxtData`

### 3. `VaultSidebar.vue`

- Recursive `VaultTreeItem.vue` (folder row + children)
- Props: `nodes`, `activeId`, `expandedPaths`
- Emits: `navigate`, `toggle`, `new-page` with optional folder path
- "New page" header button → `/notes/new` or `/notes/new?folder=...` when folder selected / context
- Active page: match `route.params.slug` joined or board slug

### 4. App shell (`app.vue`)

```
┌──────────────┬─────────────────────────────────────┐
│ VaultSidebar │ header (sync, settings, theme, ☰) │
│  (240px)     ├─────────────────────────────────────┤
│              │ <NuxtPage />                        │
└──────────────┴─────────────────────────────────────┘
```

- Desktop (`md:` and up): sidebar visible, fixed width
- Mobile: sidebar `fixed inset-y-0 left-0 z-40`, translate off-screen; open via header button; backdrop `z-30` closes on click
- Hide sidebar entirely on `/login`, `/signup`, `/accept-invitation/*`

### 5. Folder-aware new note

**Files:** `note-document.ts`, `useNoteAutosave.ts`, `pages/notes/new.vue`

- Read `route.query.folder` (string, validated: no `..`, no leading/trailing slashes)
- `noteIdFromBlocks(blocks, folderPrefix?)` → `folder ? `${folder}/${slug}` : slug`
- Sidebar "New page" on folder row → `navigateTo({ path: '/notes/new', query: { folder: path } })`

### 6. Home page

- No structural change to `index.vue` list — remains in main pane
- Remove redundant "← Notes" back links on note pages (sidebar provides navigation)

## Tasks

- [x] **T1** — `vault-tree.ts` + `vault-tree.test.ts` (flat, nested, kanban href, sort)
- [x] **T2** — `useVaultTree.ts` composable + localStorage expand state
- [x] **T3** — `VaultSidebar.vue` + `VaultTreeItem.vue`
- [x] **T4** — Refactor `app.vue` two-column layout + mobile overlay
- [x] **T5** — `?folder=` support in new note flow + sidebar new-page links
- [x] **T6** — Wire `refreshNuxtData` after autosave create; trim back links on note pages
- [x] **T7** — Typecheck, vitest, manual QA checklist

## Risks & mitigations

| Risk | Mitigation |
| ---- | ---------- |
| Duplicate fetch `/api/notes` (home + sidebar) | Same `useFetch` key / composable singleton |
| Large vaults slow tree build | Measure; defer `GET /api/notes/tree` to v1.1 if needed |
| Invalid `?folder=` path | Sanitize server-side id rules already in `note-id.ts`; reject `..` client-side |
| Overlay traps focus on mobile | Close on navigate; backdrop click; optional Escape key |

## Test plan

- [x] Unit: tree from `[{ id: 'a' }, { id: 'projets/b' }]` → correct hierarchy
- [x] Unit: kanban frontmatter → `/boards/` href
- [x] Unit: `noteIdFromBlocks` with folder prefix
- [x] Manual: desktop sidebar visible; mobile overlay opens/closes
- [x] Manual: new page from folder creates `folder/title-slug`
- [x] Manual: workspace switch reloads tree (auth mode)

## Verification

- [x] `pnpm turbo run typecheck --filter=@fluffmind/web`
- [x] `pnpm --filter @fluffmind/web test`
- [x] Update PRD-029 status → `shipped` when merged
