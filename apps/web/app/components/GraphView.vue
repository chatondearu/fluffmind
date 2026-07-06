<script setup lang="ts">
import 'v-network-graph/lib/style.css'
import { VNetworkGraph } from 'v-network-graph'
import type { Edges, EventHandlers, Nodes } from 'v-network-graph'

interface GraphNodeProp {
  id: string
  title: string
}

interface GraphEdgeProp {
  source: string
  target: string
}

const props = defineProps<{
  nodes: GraphNodeProp[]
  edges: GraphEdgeProp[]
}>()

const emit = defineEmits<{
  'select-node': [id: string]
}>()

const nodes = computed<Nodes>(() => Object.fromEntries(props.nodes.map((node) => [node.id, { name: node.title }])))

const edges = computed<Edges>(() =>
  Object.fromEntries(props.edges.map((edge, index) => [`e${index}`, { source: edge.source, target: edge.target }]))
)

const eventHandlers: EventHandlers = {
  'node:click': ({ node }) => emit('select-node', node)
}
</script>

<template>
  <VNetworkGraph :nodes="nodes" :edges="edges" :event-handlers="eventHandlers" style="width: 100%; height: 70vh" />
</template>
