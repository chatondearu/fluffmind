<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindDivider,
  FluffmindTextField,
} from '@fluffmind/design-system/src/components'

import { useVaultTree } from '../composables/useVaultTree'

const props = defineProps<{
  workspaceId?: string
  workspaceName?: string
  mobileOpen?: boolean
}>()

const emit = defineEmits<{
  navigate: []
  close: []
}>()

const route = useRoute()
const workspaceLabel = computed(() => props.workspaceName?.trim() || 'Workspace')

const {
  tree,
  pending,
  search,
  isExpanded,
  toggleFolder,
  ensureExpanded,
  createFolder,
} = useVaultTree(props.workspaceId ?? 'default', workspaceLabel)

const folderDialogOpen = ref(false)
const folderDialogParent = ref<string | null>(null)

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
  ensureExpanded('')
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

function goNewPage(folder: string | null) {
  navigateTo(newPageLink(folder))
  onNavigate()
}

function requestNewFolder(parent: string | null) {
  folderDialogParent.value = parent
  folderDialogOpen.value = true
}

async function confirmNewFolder(name: string) {
  await createFolder(folderDialogParent.value, name)
}
</script>

<template>
  <aside
    class="md3-sidebar h-full min-h-0"
    :class="mobileOpen ? 'fixed inset-y-0 left-0 z-40 shadow-md3-2' : 'hidden md:flex'"
  >
    <div class="px-4 py-4">
      <NuxtLink to="/" class="block" @click="onNavigate">
        <p class="md3-title-md truncate text-on-surface">
          Fluffmind
        </p>
      </NuxtLink>
    </div>

    <div class="px-3 pb-3">
      <FluffmindTextField
        v-model="search"
        type="search"
        placeholder="Rechercher une note…"
      />
    </div>

    <FluffmindDivider />

    <nav class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <p v-if="pending" class="px-3 py-2 md3-label-md">
        Chargement…
      </p>
      <ul v-else class="flex flex-col gap-0.5">
        <VaultTreeItem
          v-for="node in tree"
          :key="node.path || 'root'"
          :node="node"
          :depth="0"
          :active-id="activeId"
          :is-expanded="isExpanded"
          @toggle="toggleFolder"
          @new-page="goNewPage"
          @new-folder-request="requestNewFolder"
          @navigate="onNavigate"
        />
      </ul>
    </nav>

    <FluffmindDivider />

    <div class="flex flex-col gap-1 px-3 py-3">
      <NuxtLink to="/graph" @click="onNavigate">
        <FluffmindButton variant="tonal" size="sm" class="w-full">
          Graph
        </FluffmindButton>
      </NuxtLink>
    </div>

    <FolderCreateDialog
      v-model:open="folderDialogOpen"
      @confirm="confirmNewFolder"
    />
  </aside>
</template>
