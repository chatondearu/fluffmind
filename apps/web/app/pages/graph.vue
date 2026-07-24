<script setup lang="ts">
import type { GraphData } from '../../server/vault/index'
import { FluffmindButton } from '@fluffmind/design-system/src/components'

const { data } = await useFetch<GraphData>('/api/graph')
const router = useRouter()

function onSelectNode(id: string) {
  router.push(`/notes/${id}`)
}
</script>

<template>
  <main class="md3-page max-w-5xl">
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="md3-display-sm">
          Graph
        </h1>
        <p class="mt-1 md3-body-md text-on-surface-variant">
          Visualise les liens entre tes notes.
        </p>
        <p class="mt-1 md3-label-md text-on-surface-variant">
          Clic = focus · Double-clic = ouvrir
        </p>
      </div>
      <NuxtLink to="/">
        <FluffmindButton variant="tonal" size="sm">
          ← Notes
        </FluffmindButton>
      </NuxtLink>
    </header>
    <GraphView v-if="data" :nodes="data.nodes" :edges="data.edges" @select-node="onSelectNode" />
  </main>
</template>
