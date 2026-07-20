# PRD-029 — Vault sidebar navigation (pages & folders)

- **Status**: shipped
- **Date**: 2026-07-11
- **Shipped**: 2026-07-11 (PR [#95](https://github.com/chatondearu/fluffmind/pull/95); follow-ups [#98](https://github.com/chatondearu/fluffmind/pull/98), [#100](https://github.com/chatondearu/fluffmind/pull/100))
- **Tags**: #product #ux
- **Depends on**: PRD-028 (MVP), PRD-024 (block editor); complements PR [#94](https://github.com/chatondearu/fluffmind/pull/94) (Notion-like editor)
- **GitHub**: PR [#95](https://github.com/chatondearu/fluffmind/pull/95) (no dedicated epic — scoped via this PRD + PLAN-029)
- **Superseded in part by**: [[PRD-030-editor-vault-v2|PRD-030]] (sidebar `⋯` context menu, rename/delete APIs)

## Problem

Today, vault navigation is a **flat list** on the home page (`/`). Notes are opened in
isolation with a back link — there is no persistent view of **where you are** in the
vault hierarchy. As the number of pages grows, this feels unlike modern PKM tools
(Notion, Obsidian) and makes folder-organized vaults hard to browse.

Note ids already encode folder structure (`projets/roadmap`, `inbox/tasks`) because
they mirror relative paths in the Git vault — but the UI does not surface that tree.

## Goals

- [x] Persistent **left sidebar** on main app routes showing **folders and pages** as a tree
- [x] Click a page → navigate to `/notes/:id` (or `/boards/:id` for kanban boards)
- [x] Highlight the **active page** in the sidebar
- [x] **New page** action from the sidebar (creates under selected folder or root)
- [x] Sidebar reflects the **active workspace** vault when auth is enabled
- [x] Sidebar **updates after autosave** / vault index invalidation (new or renamed notes)

## Non-goals (v1)

- Drag-and-drop reorder or move notes between folders (requires move/rename API + Git) — partially addressed later in PRD-030 via rename/move APIs (still no DnD in sidebar)
- Creating **empty folders** with no note (folders remain implicit from paths) — PRD-030 added folder markers via `POST /api/folders`
- Sidebar search replacing global search (search can be a follow-up)
- Favourites / pinned pages
- Right-click context menus (rename, delete, duplicate) — delivered in PRD-030 as hover `⋯`
- Replacing the home page graph or settings routes

## Users & scenarios

| Persona | Scenario |
| ------- | -------- |
| Solo self-hoster | Opens Fluffmind, sees vault tree on the left, picks a note, edits with Notion-like editor |
| Multi-workspace user | Switches workspace in header; sidebar reloads that workspace's tree |
| Foam/Obsidian migrator | Existing nested vault (`docs/`, `projets/`) appears as folders without migration |

## Requirements

### Functional

#### Tree model

- [x] Build a **virtual folder tree** from note ids returned by `GET /api/notes`:
  - Split each note id on `/`; all segments except the last form folder nodes
  - Leaf nodes are pages (`.md` files); intermediate nodes are folders
  - Kanban boards (`frontmatter` kanban) link to `/boards/:id` instead of `/notes/:id`
- [x] Sort: folders first, then pages, **alphabetically** (locale-aware) at each level
- [x] Root-level pages (no `/` in id) appear at the top level alongside folders

#### Sidebar UI

- [x] Fixed **left column** (~240–280 px), scrollable independently of main content
- [x] **Expand/collapse** folder nodes (chevron or click on folder row)
- [x] Persist expand state in **`localStorage`** (key scoped by workspace id)
- [x] Visual active state for current route's note/board id
- [x] **Collapse toggle** on narrow viewports — sidebar opens as **overlay** (fixed panel + backdrop dismiss)
- [x] Header area: workspace name or "Notes" + **New page** button → `/notes/new` or `/notes/new?folder=<path>` when a folder is selected in the tree

#### Layout integration

- [x] Refactor `app.vue` (or new `AppLayout`) to **two-column shell**:
  - Left: sidebar (hidden on `/login`, `/signup`, `/accept-invitation/*`)
  - Right: existing header controls (sync, settings, theme) + `<NuxtPage />`
- [x] **Keep `/` home route** with its existing flat list + search in the main pane (sidebar complements, does not replace it)

#### Data & API

- [x] **v1**: derive tree **client-side** from existing `GET /api/notes` (no new endpoint required)
- [ ] Optional **v1.1**: `GET /api/notes/tree` returning pre-built tree JSON if client aggregation becomes slow (>500 notes) — not needed yet
- [x] Subscribe to vault refresh: re-fetch tree after note create/autosave (use `refreshNuxtData` / shared composable)

### Non-functional

- [x] Tree build for 500 notes **< 50 ms** on client (measure in devtools)
- [ ] Sidebar usable with **keyboard** (Tab into tree, Enter to open, Arrow keys to expand folders — stretch for v1.1)
- [x] **MD3 tokens** + UnoCSS; match existing design-system components where possible
- [x] No new server write paths in v1; read-only navigation over existing vault index (mutations came in PRD-030)

## UX reference (Notion-like)

```
┌─────────────────┬──────────────────────────────────┐
│ [+ New page]    │  ← Notes    Sync  Settings  Theme │
├─────────────────┼──────────────────────────────────┤
│ ▼ projets       │                                  │
│    roadmap      │   (editor / page content)        │
│    specs        │                                  │
│ ▶ inbox         │                                  │
│ welcome         │                                  │
└─────────────────┴──────────────────────────────────┘
```

- No visible form fields in the main pane (editor PR #94)
- Sidebar always visible on **desktop**; on **mobile**, hidden by default — hamburger opens **overlay** drawer

## Decisions (2026-07-11)

| Question | Decision |
| -------- | -------- |
| Home route (`/`) | **Keep** the flat list + search in the main content area |
| New page in folder | **Yes** — `/notes/new?folder=projets` prefixes generated note id (`projets/<slug>`) |
| Mobile sidebar | **Overlay** — fixed panel over content with backdrop, not push/reflow |
| Folder icons (v1) | Generic folder icon only |

## Related project memory

- ADR-001: folders are paths in Git, not DB entities — [[../foam/decisions/ADR-001-markdown-git-source-of-truth|ADR-001]]
- Note id rules: `apps/web/server/vault/note-id.ts`
- Vault index: `apps/web/server/vault/index.ts` (`NoteSummary.id` is path without `.md`)
- Kanban routing: `@fluffmind/kanban` + `isKanbanBoard(frontmatter)`

## Issue breakdown

Delivered as a single PR rather than per-issue tickets:

| PR | Scope |
| -- | ----- |
| [#95](https://github.com/chatondearu/fluffmind/pull/95) | Tree util, sidebar, app shell, `?folder=`, refresh |

## Success metrics

- User can reach any note in ≤ 2 clicks from any page (sidebar visible)
- Nested vault with 50+ notes remains navigable without scrolling the home list
- No regression on solo/auth modes or workspace switching

## Implementation pointer

Plan: [[../plans/PLAN-029-vault-sidebar-navigation|PLAN-029]] (shipped)

**Key packages/files:**

| Area | Path |
| ---- | ---- |
| Tree util | `apps/web/app/utils/vault-tree.ts` |
| Sidebar | `apps/web/app/components/VaultSidebar.vue` |
| Layout | `apps/web/app/app.vue` |
| Composable | `apps/web/app/composables/useVaultTree.ts` |
| Tests | `apps/web/app/utils/vault-tree.test.ts` |
