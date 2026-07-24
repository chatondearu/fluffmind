# Graph Force Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the vault graph readable with a live force-directed layout, degree-based node sizes, neighborhood highlight (hover/click), and double-click to open a note.

**Architecture:** Keep `GET /api/graph` and `v-network-graph`. Add pure helpers for degree/neighborhood/radius. Rework `GraphView.vue` to use `ForceLayout` from `v-network-graph/lib/force-layout`, style nodes/edges from focus/hover state, and emit `select-node` only on double-click. `graph.vue` adds a short gesture hint.

**Tech Stack:** Vue 3 `<script setup>`, `v-network-graph` 0.9.x, `d3-force` 3.x, Vitest, MD3 CSS variables for colors.

**Spec:** `docs/superpowers/specs/2026-07-24-graph-force-layout-design.md`

## Global Constraints

- Do **not** change `GET /api/graph` or `GraphData` shape.
- Do **not** introduce Cytoscape / Sigma / custom Canvas.
- Layout API is `new ForceLayout()` from `v-network-graph/lib/force-layout` (not a string `"d3-force"`).
- Set `view.doubleClickZoomEnabled: false` so double-click opens notes.
- Vue components: `<script setup lang="ts>` + typed props (Anthony Fu style).
- Code comments in English; UI copy in French.
- Conventional Commits: `feat(web): …`, `test(web): …`, `docs: …`.
- Tests: `pnpm --filter @fluffmind/web run test`
- Typecheck: `pnpm --filter @fluffmind/web run typecheck`

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/web/package.json` | Add `d3-force` dependency (+ `@types/d3-force` if needed) |
| `apps/web/app/utils/graph-neighborhood.ts` | Pure degree / neighbors / radius helpers |
| `apps/web/app/utils/graph-neighborhood.test.ts` | Unit tests for helpers |
| `apps/web/app/components/GraphView.vue` | Force layout, sizing, focus/hover styles, events |
| `apps/web/app/pages/graph.vue` | Gesture hint; keep `@select-node` → router |

---

### Task 1: Neighborhood / degree helpers (TDD)

**Files:**
- Create: `apps/web/app/utils/graph-neighborhood.ts`
- Create: `apps/web/app/utils/graph-neighborhood.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface GraphEdgeLike {
    source: string
    target: string
  }

  export function computeDegrees(edges: GraphEdgeLike[]): Map<string, number>
  export function neighborsOf(id: string, edges: GraphEdgeLike[]): Set<string>
  export function activeSeed(focusedId: string | null, hoveredId: string | null): string | null
  export function nodeRadius(
    degree: number,
    opts?: { base?: number, k?: number, minR?: number, maxR?: number },
  ): number
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'

import {
  activeSeed,
  computeDegrees,
  neighborsOf,
  nodeRadius,
} from './graph-neighborhood'

describe('computeDegrees', () => {
  it('counts each incident endpoint once', () => {
    const degrees = computeDegrees([
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
      { source: 'b', target: 'c' },
    ])
    expect(degrees.get('a')).toBe(2)
    expect(degrees.get('b')).toBe(2)
    expect(degrees.get('c')).toBe(2)
  })

  it('counts self-loops as one incident edge on that node', () => {
    const degrees = computeDegrees([{ source: 'a', target: 'a' }])
    expect(degrees.get('a')).toBe(1)
  })

  it('counts duplicate edges separately', () => {
    const degrees = computeDegrees([
      { source: 'a', target: 'b' },
      { source: 'a', target: 'b' },
    ])
    expect(degrees.get('a')).toBe(2)
    expect(degrees.get('b')).toBe(2)
  })
})

describe('neighborsOf', () => {
  it('returns adjacent ids excluding self', () => {
    const n = neighborsOf('a', [
      { source: 'a', target: 'b' },
      { source: 'c', target: 'a' },
      { source: 'b', target: 'c' },
      { source: 'a', target: 'a' },
    ])
    expect([...n].sort()).toEqual(['b', 'c'])
  })
})

describe('activeSeed', () => {
  it('prefers focusedId over hoveredId', () => {
    expect(activeSeed('a', 'b')).toBe('a')
    expect(activeSeed(null, 'b')).toBe('b')
    expect(activeSeed(null, null)).toBeNull()
  })
})

describe('nodeRadius', () => {
  it('clamps and scales with sqrt(degree)', () => {
    expect(nodeRadius(0)).toBe(10) // base default
    expect(nodeRadius(0, { base: 10, k: 3, minR: 8, maxR: 28 })).toBe(10)
    expect(nodeRadius(9, { base: 10, k: 3, minR: 8, maxR: 28 })).toBe(19) // 10 + 3*3
    expect(nodeRadius(1000, { base: 10, k: 3, minR: 8, maxR: 28 })).toBe(28)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter @fluffmind/web exec vitest run app/utils/graph-neighborhood.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement helpers**

```ts
export interface GraphEdgeLike {
  source: string
  target: string
}

export function computeDegrees(edges: GraphEdgeLike[]): Map<string, number> {
  const degrees = new Map<string, number>()
  for (const edge of edges) {
    if (edge.source === edge.target) {
      degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1)
      continue
    }
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1)
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1)
  }
  return degrees
}

export function neighborsOf(id: string, edges: GraphEdgeLike[]): Set<string> {
  const neighbors = new Set<string>()
  for (const edge of edges) {
    if (edge.source === id && edge.target !== id)
      neighbors.add(edge.target)
    else if (edge.target === id && edge.source !== id)
      neighbors.add(edge.source)
  }
  return neighbors
}

export function activeSeed(
  focusedId: string | null,
  hoveredId: string | null,
): string | null {
  return focusedId ?? hoveredId
}

export function nodeRadius(
  degree: number,
  opts: { base?: number, k?: number, minR?: number, maxR?: number } = {},
): number {
  const base = opts.base ?? 10
  const k = opts.k ?? 3
  const minR = opts.minR ?? 8
  const maxR = opts.maxR ?? 28
  const raw = base + k * Math.sqrt(Math.max(0, degree))
  return Math.min(maxR, Math.max(minR, raw))
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @fluffmind/web exec vitest run app/utils/graph-neighborhood.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/utils/graph-neighborhood.ts apps/web/app/utils/graph-neighborhood.test.ts
git commit -m "$(cat <<'EOF'
feat(web): add graph neighborhood helpers for force layout

EOF
)"
```

---

### Task 2: `d3-force` dependency + force layout + degree sizing

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/app/components/GraphView.vue`
- Consumes: helpers from Task 1

**Interfaces:**
- Consumes: `computeDegrees`, `nodeRadius` from `../utils/graph-neighborhood`
- Produces: graph that animates with `ForceLayout`; node radius from degree; **still** navigates on single click until Task 3

- [ ] **Step 1: Add dependency**

From repo root:

```bash
pnpm --filter @fluffmind/web add d3-force
pnpm --filter @fluffmind/web add -D @types/d3-force
```

Verify `apps/web/package.json` lists `"d3-force"` under `dependencies`.

- [ ] **Step 2: Rewrite `GraphView.vue` for force + sizing**

Replace `apps/web/app/components/GraphView.vue` with:

```vue
<script setup lang="ts">
import 'v-network-graph/lib/style.css'
import { VNetworkGraph, defineConfigs } from 'v-network-graph'
import { ForceLayout } from 'v-network-graph/lib/force-layout'
import type { Edges, EventHandlers, Nodes } from 'v-network-graph'

import { computeDegrees, nodeRadius } from '../utils/graph-neighborhood'

interface GraphNodeProp {
  id: string
  title: string
}

interface GraphEdgeProp {
  source: string
  target: string
}

interface GraphNodeData {
  id: string
  name: string
}

const props = defineProps<{
  nodes: GraphNodeProp[]
  edges: GraphEdgeProp[]
}>()

const emit = defineEmits<{
  'select-node': [id: string]
}>()

const degrees = computed(() => computeDegrees(props.edges))

const nodes = computed<Nodes>(() =>
  Object.fromEntries(
    props.nodes.map(node => [
      node.id,
      { id: node.id, name: node.title } satisfies GraphNodeData,
    ]),
  ),
)

const edges = computed<Edges>(() =>
  Object.fromEntries(
    props.edges.map((edge, index) => [
      `e${index}`,
      { source: edge.source, target: edge.target },
    ]),
  ),
)

const configs = defineConfigs({
  view: {
    layoutHandler: new ForceLayout({
      positionFixedByClickWithAltKey: true,
    }),
    doubleClickZoomEnabled: false,
    autoPanAndZoomOnLoad: 'fit-content',
  },
  node: {
    normal: {
      type: 'circle',
      radius: (node: GraphNodeData) =>
        nodeRadius(degrees.value.get(node.id) ?? 0),
      color: 'var(--md-primary)',
      strokeWidth: 1,
      strokeColor: 'var(--md-outline)',
    },
    label: {
      visible: true,
      fontSize: 11,
      color: 'var(--md-on-surface)',
      direction: 'south',
    },
  },
  edge: {
    normal: {
      width: 1.5,
      color: 'color-mix(in srgb, var(--md-outline) 70%, transparent)',
      dasharray: undefined,
      animate: false,
      animationSpeed: 0,
    },
  },
})

const eventHandlers: EventHandlers = {
  'node:click': ({ node }) => emit('select-node', node),
}
</script>

<template>
  <VNetworkGraph
    :nodes="nodes"
    :edges="edges"
    :configs="configs"
    :event-handlers="eventHandlers"
    style="width: 100%; height: 70vh"
  />
</template>
```

Notes:
- Keep `id` on every node object so style callbacks can resolve degree.
- If MD3 CSS var names differ, match `packages/design-system` / `md3.css`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @fluffmind/web run typecheck`

Expected: PASS (fix only pre-existing unrelated errors)

- [ ] **Step 4: Manual smoke (dev)**

Run: `pnpm --filter @fluffmind/web run dev` with `VAULT_PATH` set; open `/graph`.

Expected: nodes move then settle into clusters by links; hubs larger than isolates.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/app/components/GraphView.vue
git commit -m "$(cat <<'EOF'
feat(web): enable d3 force layout and degree-based node size

EOF
)"
```

---

### Task 3: Neighborhood focus / hover + double-click navigation

**Files:**
- Modify: `apps/web/app/components/GraphView.vue`
- Consumes: `activeSeed`, `neighborsOf` from Task 1

**Interfaces:**
- Produces: `select-node` emitted **only** on `node:dblclick`
- Focus rules from spec: seed = `focusedId ?? hoveredId`; while `focusedId` set, dimming follows focus only; hover may thicken stroke

- [ ] **Step 1: Extend `GraphView.vue` with focus state and style functions**

Merge into the Task 2 component (replace configs + events):

```ts
import {
  activeSeed,
  computeDegrees,
  neighborsOf,
  nodeRadius,
} from '../utils/graph-neighborhood'

const focusedId = ref<string | null>(null)
const hoveredId = ref<string | null>(null)

const seed = computed(() => activeSeed(focusedId.value, hoveredId.value))

const activeNodeIds = computed(() => {
  const id = seed.value
  if (!id)
    return null
  const set = new Set(neighborsOf(id, props.edges))
  set.add(id)
  return set
})

function isNodeActive(nodeId: string): boolean {
  const active = activeNodeIds.value
  if (!active)
    return true
  return active.has(nodeId)
}

function isEdgeActive(source: string, target: string): boolean {
  const id = seed.value
  if (!id)
    return true
  return source === id || target === id
}

const configs = computed(() =>
  defineConfigs({
    view: {
      layoutHandler: new ForceLayout({
        positionFixedByClickWithAltKey: true,
      }),
      doubleClickZoomEnabled: false,
      autoPanAndZoomOnLoad: 'fit-content',
    },
    node: {
      normal: {
        type: 'circle',
        radius: (node: GraphNodeData) =>
          nodeRadius(degrees.value.get(node.id) ?? 0),
        color: (node: GraphNodeData) =>
          isNodeActive(node.id)
            ? 'var(--md-primary)'
            : 'color-mix(in srgb, var(--md-on-surface) 25%, transparent)',
        strokeWidth: (node: GraphNodeData) => {
          if (focusedId.value && node.id === hoveredId.value)
            return 3
          if (node.id === focusedId.value || node.id === seed.value)
            return 2
          return 1
        },
        strokeColor: 'var(--md-outline)',
      },
      label: {
        visible: true,
        fontSize: 11,
        color: (node: GraphNodeData) =>
          isNodeActive(node.id)
            ? 'var(--md-on-surface)'
            : 'color-mix(in srgb, var(--md-on-surface) 35%, transparent)',
        direction: 'south',
      },
    },
    edge: {
      normal: {
        width: (edge: { source: string, target: string }) =>
          isEdgeActive(edge.source, edge.target) ? 2 : 1,
        color: (edge: { source: string, target: string }) =>
          isEdgeActive(edge.source, edge.target)
            ? 'var(--md-primary)'
            : 'color-mix(in srgb, var(--md-outline) 25%, transparent)',
        animate: false,
        animationSpeed: 0,
      },
    },
  }),
)

const eventHandlers: EventHandlers = {
  'node:click': ({ node }) => {
    focusedId.value = node
  },
  'node:dblclick': ({ node }) => {
    emit('select-node', node)
  },
  'node:pointerover': ({ node }) => {
    hoveredId.value = node
  },
  'node:pointerout': () => {
    hoveredId.value = null
  },
  'view:click': () => {
    focusedId.value = null
  },
}
```

Template: bind `:configs="configs"` (computed).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @fluffmind/web run typecheck`

Expected: PASS for changes in `GraphView.vue`

- [ ] **Step 3: Manual smoke**

On `/graph`:
1. Hover a hub → neighbors + edges highlight; others dim.
2. Click a node → focus persists after pointer leaves.
3. Click background → focus clears.
4. Double-click a node → navigates to `/notes/:id`.
5. Single click must **not** navigate.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/components/GraphView.vue
git commit -m "$(cat <<'EOF'
feat(web): highlight graph neighborhood and open notes on double-click

EOF
)"
```

---

### Task 4: Page hint + final verification

**Files:**
- Modify: `apps/web/app/pages/graph.vue`

- [ ] **Step 1: Add gesture hint**

Update the subtitle block in `apps/web/app/pages/graph.vue`:

```vue
<p class="mt-1 md3-body-md text-on-surface-variant">
  Visualise les liens entre tes notes.
</p>
<p class="mt-1 md3-label-md text-on-surface-variant">
  Clic = focus · Double-clic = ouvrir
</p>
```

Keep existing `@select-node="onSelectNode"` wiring.

- [ ] **Step 2: Run automated checks**

```bash
pnpm --filter @fluffmind/web exec vitest run app/utils/graph-neighborhood.test.ts
pnpm --filter @fluffmind/web run typecheck
pnpm --filter @fluffmind/web run lint
```

Expected: tests PASS; typecheck PASS; lint clean on touched files.

- [ ] **Step 3: Final manual checklist**

- [ ] Live force settle into clusters
- [ ] Hub nodes larger
- [ ] Hover neighborhood
- [ ] Click focus + background clear
- [ ] Double-click opens note
- [ ] Empty / sparse vault does not crash

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/pages/graph.vue
git commit -m "$(cat <<'EOF'
feat(web): document graph focus and open gestures

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| ---------------- | ---- |
| Live `ForceLayout` / d3-force | Task 2 |
| Declare `d3-force` dependency | Task 2 |
| Degree-based radius (clamped) | Task 1 + 2 |
| Hover temporary neighborhood | Task 3 |
| Click persistent focus | Task 3 |
| Clear focus on background | Task 3 |
| Double-click → navigate | Task 3 |
| Disable dblclick zoom | Task 2 / 3 |
| Page gesture hint | Task 4 |
| No API / GraphData change | (none) |
| Helpers unit-tested | Task 1 |

## Out of scope (do not implement)

- Clustering by folder/tags, filters, search
- Sigma/Cytoscape migration
- Persisted pin positions beyond Alt+click session behavior
