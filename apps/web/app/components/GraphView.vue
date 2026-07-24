<script setup lang="ts">
import 'v-network-graph/lib/style.css'
import { VNetworkGraph, defineConfigs } from 'v-network-graph'
import { ForceLayout } from 'v-network-graph/lib/force-layout'
import type { Edges, EventHandlers, Node, Nodes } from 'v-network-graph'

import { computeDegrees, nodeRadius } from '../utils/graph-neighborhood'

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

// Keep a single ForceLayout instance so focus/style updates do not restart the simulation.
const layoutHandler = new ForceLayout({
  positionFixedByClickWithAltKey: true,
})

const configs = defineConfigs({
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
