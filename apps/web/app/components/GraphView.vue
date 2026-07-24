<script setup lang="ts">
import 'v-network-graph/lib/style.css'
import { VNetworkGraph, defineConfigs } from 'v-network-graph'
import { ForceLayout } from 'v-network-graph/lib/force-layout'
import type { Edge, Edges, EventHandlers, Node, Nodes } from 'v-network-graph'

import {
  activeSeed,
  computeDegrees,
  neighborsOf,
  nodeRadius,
} from '../utils/graph-neighborhood'

interface GraphNodeProp {
  id: string
  title: string
}

interface GraphEdgeProp {
  source: string
  target: string
}

interface GraphNodeData extends Node {
  id: string
  name: string
}

function asGraphNode(node: Node): GraphNodeData {
  return node as GraphNodeData
}

const props = defineProps<{
  nodes: GraphNodeProp[]
  edges: GraphEdgeProp[]
}>()

const emit = defineEmits<{
  'select-node': [id: string]
}>()

const focusedId = ref<string | null>(null)
const hoveredId = ref<string | null>(null)

const degrees = computed(() => computeDegrees(props.edges))

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

// Stable instance: recreating ForceLayout on focus changes would restart the simulation.
const layoutHandler = new ForceLayout({
  positionFixedByClickWithAltKey: true,
})

const configs = computed(() =>
  defineConfigs({
    view: {
      layoutHandler,
      doubleClickZoomEnabled: false,
      autoPanAndZoomOnLoad: 'fit-content',
    },
    node: {
      normal: {
        type: 'circle',
        radius: (node: Node) =>
          nodeRadius(degrees.value.get(asGraphNode(node).id) ?? 0),
        color: (node: Node) =>
          isNodeActive(asGraphNode(node).id)
            ? 'var(--md-primary)'
            : 'color-mix(in srgb, var(--md-on-surface) 25%, transparent)',
        strokeWidth: (node: Node) => {
          const id = asGraphNode(node).id
          if (focusedId.value && id === hoveredId.value)
            return 3
          if (id === focusedId.value || id === seed.value)
            return 2
          return 1
        },
        strokeColor: 'var(--md-outline)',
      },
      label: {
        visible: true,
        fontSize: 11,
        color: (node: Node) =>
          isNodeActive(asGraphNode(node).id)
            ? 'var(--md-on-surface)'
            : 'color-mix(in srgb, var(--md-on-surface) 35%, transparent)',
        direction: 'south',
      },
    },
    edge: {
      normal: {
        width: (edge: Edge) =>
          isEdgeActive(edge.source, edge.target) ? 2 : 1,
        color: (edge: Edge) =>
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
