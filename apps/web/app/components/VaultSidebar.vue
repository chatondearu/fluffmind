<script setup lang="ts">
import {
  FluffmindChip,
  FluffmindDivider,
  FluffmindIconButton,
  FluffmindTooltip,
} from '@fluffmind/design-system/src/components'

import { useVaultTree } from '../composables/useVaultTree'

const props = defineProps<{
  workspaceId?: string
  mobileOpen?: boolean
}>()

const emit = defineEmits<{
  navigate: []
  close: []
}>()

const route = useRoute()
const { tree, pending, isExpanded, toggleFolder, ensureExpanded } = useVaultTree(props.workspaceId ?? 'default')

const activeId = computed(() => {
  if (route.path.startsWith('/notes/')) {
    const slug = route.params.slug
    return Array.isArray(slug) ? slug.join('/') : String(slug ?? '')
  }
  if (route.path.startsWith('/boards/')) {
    const slug = route.params.slug
    return Array.isArray(slug) ? slug.join('/') : String(slug ?? '')
  }
  return null
})

function expandActivePath() {
  const id = activeId.value
  if (!id) return
  const segments = id.split('/').slice(0, -1)
  let path = ''
  for (const segment of segments) {
    path = path ? `${path}/${segment}` : segment
    ensureExpanded(path)
  }
}

watch(activeId, () => expandActivePath(), { immediate: true })

function newPageLink(folder: string | null = null) {
  if (folder) {
    return { path: '/notes/new', query: { folder } }
  }
  return { path: '/notes/new' }
}

function onNavigate() {
  emit('navigate')
  emit('close')
}
</script>

<template>
  <aside
    class="md3-sidebar"
    :class="mobileOpen ? 'fixed inset-y-0 left-0 z-40 shadow-md3-2' : 'hidden md:flex'"
  >
    <div class="flex items-center gap-2 px-4 py-4">
      <NuxtLink
        to="/"
        class="min-w-0 flex-1"
        @click="onNavigate"
      >
        <p class="md3-title-md truncate text-on-surface">
          Fluffmind
        </p>
        <p class="md3-label-md truncate">
          Vault
        </p>
      </NuxtLink>
      <FluffmindTooltip text="Nouvelle page">
        <NuxtLink :to="newPageLink()" @click="onNavigate">
          <FluffmindIconButton label="Nouvelle page">
            +
          </FluffmindIconButton>
        </NuxtLink>
      </FluffmindTooltip>
    </div>

    <FluffmindDivider />

    <nav class="flex-1 overflow-y-auto px-3 py-3">
      <p v-if="pending" class="px-3 py-2 md3-label-md">
        Chargement…
      </p>
      <ul v-else-if="tree.length > 0" class="flex flex-col gap-0.5">
        <VaultTreeItem
          v-for="node in tree"
          :key="node.path"
          :node="node"
          :depth="0"
          :active-id="activeId"
          :is-expanded="isExpanded"
          @toggle="toggleFolder"
          @new-page="(folder) => { navigateTo(newPageLink(folder)); onNavigate() }"
          @navigate="onNavigate"
        />
      </ul>
      <div v-else class="px-3 py-6 text-center">
        <p class="md3-body-md text-on-surface-variant">
          Aucune note pour l'instant.
        </p>
        <NuxtLink :to="newPageLink()" class="mt-3 inline-block" @click="onNavigate">
          <FluffmindChip variant="outlined">
            Créer une page
          </FluffmindChip>
        </NuxtLink>
      </div>
    </nav>
  </aside>
</template>
