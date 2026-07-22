<script setup lang="ts">
import {
  FluffmindButton,
  FluffmindDivider,
  FluffmindTextField,
} from '@fluffmind/design-system/src/components'
import { $fetch } from 'ofetch'

import { slugifyFolderName, type VaultTreeNode } from '../utils/vault-tree'
import { refreshVaultNotes, useVaultTree } from '../composables/useVaultTree'

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
const renameOpen = ref(false)
const renameTarget = ref<VaultTreeNode | null>(null)
const deleteOpen = ref(false)
const deleteTarget = ref<VaultTreeNode | null>(null)
const mutationError = ref<string | null>(null)

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

function requestRename(node: VaultTreeNode) {
  renameTarget.value = node
  renameOpen.value = true
}

function requestDelete(node: VaultTreeNode) {
  deleteTarget.value = node
  deleteOpen.value = true
}

const renameInitialValue = computed(() => {
  const node = renameTarget.value
  if (!node) return ''
  return node.kind === 'folder' ? node.name : node.title
})

const deleteDescription = computed(() => {
  const node = deleteTarget.value
  if (!node) return ''
  if (node.kind === 'folder') {
    return `Supprimer le dossier « ${node.name} » et toutes les notes qu'il contient ? Cette action est irréversible.`
  }
  return `Supprimer la note « ${node.title} » ? Cette action est irréversible.`
})

async function confirmRename(name: string) {
  const node = renameTarget.value
  if (!node) return
  mutationError.value = null

  try {
    const slug = slugifyFolderName(name)
    if (!slug) return

    if (node.kind === 'page' && node.noteId) {
      const parent = node.noteId.includes('/') ? node.noteId.split('/').slice(0, -1).join('/') : ''
      const newId = parent ? `${parent}/${slug}` : slug
      await $fetch(`/api/notes/${node.noteId}`, { method: 'PATCH', body: { newId } })
      if (activeId.value === node.noteId) {
        await navigateTo(`/notes/${newId}`)
      }
    } else if (node.kind === 'folder') {
      const parent = node.path.includes('/') ? node.path.split('/').slice(0, -1).join('/') : ''
      const newPath = parent ? `${parent}/${slug}` : slug
      await $fetch(`/api/folders/${node.path}`, { method: 'PATCH', body: { newPath } })
    }

    await refreshVaultNotes()
  } catch (error) {
    mutationError.value = extractErrorMessage(error)
  }
}

async function confirmDelete() {
  const node = deleteTarget.value
  if (!node) return
  mutationError.value = null

  try {
    if (node.kind === 'page' && node.noteId) {
      await $fetch(`/api/notes/${node.noteId}`, { method: 'DELETE' })
      if (activeId.value === node.noteId) {
        await navigateTo('/')
      }
    } else if (node.kind === 'folder') {
      await $fetch(`/api/folders/${node.path}?recursive=1`, { method: 'DELETE' })
      if (activeId.value?.startsWith(`${node.path}/`)) {
        await navigateTo('/')
      }
    }

    await refreshVaultNotes()
  } catch (error) {
    mutationError.value = extractErrorMessage(error)
  }
}

function extractErrorMessage(err: unknown): string {
  const asRecord = err as { data?: { statusMessage?: string }, statusMessage?: string }
  return asRecord?.data?.statusMessage ?? asRecord?.statusMessage ?? 'Action impossible.'
}
</script>

<template>
  <aside
    class="md3-sidebar h-full min-h-0"
    :class="mobileOpen ? 'fixed inset-y-0 left-0 z-40 shadow-md3-2' : 'hidden md:flex'"
  >
    <div class="flex items-center justify-between gap-2 px-4 py-4">
      <NuxtLink to="/" class="block min-w-0 flex-1" @click="onNavigate">
        <p class="md3-title-md truncate text-on-surface">
          Fluffmind
        </p>
      </NuxtLink>
      <VaultContextMenu
        :node="{ kind: 'folder', name: workspaceLabel, path: '', href: '/', title: workspaceLabel, children: [] }"
        @new-page="goNewPage(null)"
        @new-folder="requestNewFolder(null)"
      />
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
      <p v-else-if="mutationError" class="px-3 py-2 text-sm text-error">
        {{ mutationError }}
      </p>
      <ul v-else class="m-0 flex list-none flex-col gap-0.5 p-0">
        <VaultTreeItem
          v-for="node in tree"
          :key="node.path || 'root'"
          :node="node"
          :depth="0"
          :active-id="activeId"
          :is-expanded="isExpanded"
          @toggle="toggleFolder"
          @new-page="goNewPage"
          @new-folder="requestNewFolder"
          @rename="requestRename"
          @delete="requestDelete"
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

    <PromptDialog
      v-model:open="renameOpen"
      :initial-value="renameInitialValue"
      :description="renameTarget?.kind === 'folder' ? 'Nouveau nom pour ce dossier.' : 'Nouveau titre pour cette note (utilisé comme identifiant).'"
      @confirm="confirmRename"
    />

    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Confirmer la suppression"
      :description="deleteDescription"
      confirm-label="Supprimer"
      destructive
      @confirm="confirmDelete"
    />
  </aside>
</template>
