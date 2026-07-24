# Graph force layout & neighborhood focus

**Date:** 2026-07-24  
**Status:** approved (product design)  
**Scope:** improve graph relevance via live force-directed layout, degree-based node size, and neighborhood highlight — without changing vault/API data model

## Problem

The graph view (`pages/graph.vue` + `GraphView.vue`) renders notes with `v-network-graph` but no layout handler. Nodes appear in a grid-like default placement, so link structure is hard to read. There is no visual cue for hubs (highly connected notes) or for exploring a note’s neighborhood without leaving the page. A single click already navigates away, which fights exploration.

## Goals

1. Live force-directed layout (`d3-force` via `v-network-graph`) so linked notes cluster and isolated notes stay apart; simulation runs visibly then settles.
2. Node radius scales with degree (connection count), clamped so hubs stand out without crushing the view.
3. Neighborhood highlight on hover (temporary) and click (persistent until cleared).
4. Click focuses; double-click opens the note (`/notes/:id`).
5. Stay on the existing library and `/api/graph` payload.

## Non-goals

- Switching to Cytoscape / Sigma / custom Canvas engine
- Clustering by folder or tags, filters, or in-graph search
- Changing `GET /api/graph` or vault index shape
- WebGL / large-vault (multi-thousand node) optimization beyond documenting SVG limits
- Keyboard-first graph a11y beyond labels + page hint

## Decisions

| Topic | Choice |
| ----- | ------ |
| Approach | Enrich `v-network-graph` (no new graph lib) |
| Layout | `new ForceLayout()` from `v-network-graph/lib/force-layout` + `d3-force` dependency |
| Node size | Client-side degree → `radius ≈ base + k * √degree`, clamped (~8–28 px) |
| Hover | Temporary neighborhood highlight |
| Click | Persistent focus on node + neighbors + incident edges |
| Clear focus | Click empty background or another node (retarget) |
| Navigation | Double-click → emit `select-node` → router push |
| API | Unchanged `GraphData` `{ nodes, edges }` |
| Dependency | Declare `d3-force` explicitly in `@fluffmind/web` (peer of v-network-graph) |

## Architecture

```
GET /api/graph  (unchanged)
       ↓
graph.vue
  - useFetch GraphData
  - hint: « Clic = focus · Double-clic = ouvrir »
  - @select-node → router.push(`/notes/${id}`)
       ↓
GraphView.vue
  - build Nodes/Edges for v-network-graph
  - compute degree map + adjacency from edges
  - focusedId / hoveredId → style functions
  - configs.view.layoutHandler = new ForceLayout()
  - view.doubleClickZoomEnabled = false (so dblclick opens notes)
  - events: click / dblclick / pointerover / pointerout / view click
```

Optional pure helper (e.g. `app/utils/graphNeighborhood.ts` or colocated module):

- `computeDegrees(edges) → Map<id, number>`
- `neighborsOf(id, edges) → Set<id>`
- `isInNeighborhood(id, focusId, edges) → boolean`

Keep helpers framework-free so they can be unit-tested without mounting Vue.

## UX & visual rules

### Layout

- Continuous force layout via `ForceLayout` (no pre-tick-then-freeze by default) for the “alive then settle” feel.
- Native drag; Alt+click pin/unpin (`positionFixedByClickWithAltKey: true`, library default) allowed.
- Pan/zoom remain available; **disable** `view.doubleClickZoomEnabled` so double-click is reserved for opening notes.

### Sizing

- Degree = incident edge count (undirected for sizing).
- Radius formula: `clamp(base + k * sqrt(degree), minR, maxR)` with defaults such as `base=10`, `k=3`, `minR=8`, `maxR=28` (tunable constants in `GraphView`).

### Focus / hover

**Active seed** = `focusedId` if set, else `hoveredId`. If neither is set, no dimming (full graph at normal opacity).

- **Active nodes** = seed ∪ its neighbors.
- **Active edges** = edges incident to the seed.
- Dim non-active nodes/edges (lower opacity); emphasize active with MD3 roles (`primary` / `on-surface` / outline tokens via CSS vars where practical).
- Hover never clears a click focus. While `focusedId` is set, dimming follows focus only; hover may thicken the hovered node’s stroke for pointer feedback without changing the active set.

### Navigation

- `node:click` → set `focusedId` (no router).
- `node:dblclick` → emit `select-node`.
- Click on view background → `focusedId = null`.
- Page hint under the graph title explaining the gestures.

## Components & API

### `GraphView.vue`

| Prop / emit | Type | Notes |
| ----------- | ---- | ----- |
| `nodes` | `{ id, title }[]` | unchanged |
| `edges` | `{ source, target }[]` | unchanged |
| `select-node` | `[id: string]` | emitted on **double-click** only (breaking change vs single-click) |

Internal state: `focusedId`, `hoveredId`; computed degree map; `configs` for layout + style functions.

### `graph.vue`

- Wire `@select-node` as today, but document that it fires on double-click.
- Add short gesture hint in the header/subtitle area.

## Edge cases

| Case | Behavior |
| ---- | -------- |
| Empty graph | Empty canvas, no throw |
| Single node / no edges | Node centered-ish via force; no highlight neighbors |
| Self-loops / duplicate edges | Each incident edge endpoint increments degree once; duplicates from the index count as separate edges unless the index already dedupes |
| Missing endpoint in edges | Ignore or skip styling for unknown ids (index should not emit these) |
| ~1–2k nodes | Accept SVG cost; document that larger vaults may need a later engine swap |

## Out of scope follow-ups

- Cluster by path prefix / tags
- Filter panel, search-to-focus
- Persist pinned positions
- Sigma/Cytoscape migration if SVG becomes a bottleneck

## Verification

1. Manual smoke on a vault with hubs + isolates: clusters form, hubs larger, hover/click/dblclick/clear work.
2. `pnpm --filter @fluffmind/web run typecheck`
3. Lint on touched files if the project lint script covers them.
4. Optional: unit tests for degree/neighborhood helpers.

## Implementation sketch (not a plan)

1. Add `d3-force` dependency to `apps/web`.
2. Add neighborhood/degree helpers.
3. Rework `GraphView.vue` configs + events.
4. Update `graph.vue` hint + confirm double-click navigation.
5. Typecheck + manual smoke.
