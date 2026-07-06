<script setup lang="ts">
import type { GraphData } from '../../server/vault/index'

const { data } = await useFetch<GraphData>('/api/graph')
const router = useRouter()

function onSelectNode(id: string) {
  router.push(`/notes/${id}`)
}
</script>

<template>
  <main class="mx-auto max-w-4xl p-6">
    <NuxtLink to="/" class="text-sm text-primary hover:underline">← All notes</NuxtLink>
    <h1 class="mb-4 mt-2 text-2xl font-semibold text-on-surface">
      Graph
    </h1>
    <GraphView v-if="data" :nodes="data.nodes" :edges="data.edges" @select-node="onSelectNode" />
  </main>
</template>
