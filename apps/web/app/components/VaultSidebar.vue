<script setup lang="ts">
import { FluffmindButton } from '@fluffmind/design-system/src/components'

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
    class="vault-sidebar flex h-full w-64 shrink-0 flex-col border-r border-outline/70 bg-surface"
    :class="mobileOpen ? 'fixed inset-y-0 left-0 z-40 shadow-xl' : 'hidden md:flex'"
  >
    <div class="flex items-center justify-between gap-2 border-b border-outline/70 px-3 py-3">
      <NuxtLink to="/" class="text-sm font-semibold text-on-surface hover:text-primary" @click="onNavigate">
        Notes
      </NuxtLink>
      <NuxtLink :to="newPageLink()" @click="onNavigate">
        <FluffmindButton variant="outlined">
          +
        </FluffmindButton>
      </NuxtLink>
    </div>

    <nav class="flex-1 overflow-y-auto px-2 py-2">
      <p v-if="pending" class="px-2 py-2 text-xs text-on-surface-variant">
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
      <p v-else class="px-2 py-2 text-xs text-on-surface-variant">
        Aucune note.
      </p>
    </nav>
  </aside>
</template>
