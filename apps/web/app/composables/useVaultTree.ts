import type { MaybeRef } from 'vue'
import { toValue } from 'vue'
import type { NoteSummary } from '../../server/vault/index'

import { buildVaultTree, slugifyFolderName, wrapVaultTreeRoot, type VaultTreeNode } from '../utils/vault-tree'

const NOTES_FETCH_KEY = 'vault-notes'

function storageKey(workspaceId: string): string {
  return `fluffmind-sidebar-expanded:${workspaceId}`
}

function readExpanded(workspaceId: string): Set<string> {
  if (!import.meta.client) return new Set([''])
  try {
    const raw = localStorage.getItem(storageKey(workspaceId))
    const parsed = raw ? JSON.parse(raw) as unknown : null
    const paths = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : []
    return new Set(['', ...paths])
  } catch {
    return new Set([''])
  }
}

function writeExpanded(workspaceId: string, paths: Set<string>) {
  if (!import.meta.client) return
  const stored = [...paths].filter(path => path.length > 0)
  localStorage.setItem(storageKey(workspaceId), JSON.stringify(stored))
}

export function useVaultTree(workspaceId = 'default', workspaceName: MaybeRef<string> = 'Workspace') {
  const { data, pending, refresh } = useFetch<{ notes: NoteSummary[], folders?: string[] }>('/api/notes', {
    key: NOTES_FETCH_KEY,
  })

  const search = ref('')
  const expandedPaths = ref<Set<string>>(readExpanded(workspaceId))
  const workspaceLabel = computed(() => toValue(workspaceName).trim() || 'Workspace')

  const tree = computed<VaultTreeNode[]>(() => {
    const notes = data.value?.notes ?? []
    const folders = data.value?.folders ?? []
    const query = search.value.trim().toLowerCase()

    let filteredNotes = notes
    if (query) {
      filteredNotes = notes.filter((note) => {
        const tags = Array.isArray(note.frontmatter.tags) ? note.frontmatter.tags.join(' ') : ''
        return `${note.title} ${note.id} ${tags}`.toLowerCase().includes(query)
      })
    }

    const children = buildVaultTree(filteredNotes, query ? [] : folders)
    return wrapVaultTreeRoot(workspaceLabel.value, children)
  })

  function isExpanded(path: string): boolean {
    return expandedPaths.value.has(path)
  }

  function toggleFolder(path: string) {
    const next = new Set(expandedPaths.value)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
    }
    expandedPaths.value = next
    writeExpanded(workspaceId, next)
  }

  function ensureExpanded(path: string) {
    if (expandedPaths.value.has(path)) return
    const next = new Set(expandedPaths.value)
    next.add(path)
    expandedPaths.value = next
    writeExpanded(workspaceId, next)
  }

  async function refreshTree() {
    await refresh()
  }

  async function createFolder(parentPath: string | null, folderName: string) {
    const slug = slugifyFolderName(folderName)
    if (!slug) return
    const path = parentPath ? `${parentPath}/${slug}` : slug
    await $fetch('/api/folders', { method: 'POST', body: { path } })
    ensureExpanded('')
    if (parentPath) ensureExpanded(parentPath)
    ensureExpanded(path)
    await refreshTree()
  }

  watch(
    () => workspaceId,
    (id) => {
      expandedPaths.value = readExpanded(id)
    },
  )

  return {
    tree,
    pending,
    search,
    expandedPaths,
    isExpanded,
    toggleFolder,
    ensureExpanded,
    refreshTree,
    createFolder,
  }
}

export async function refreshVaultNotes() {
  await refreshNuxtData(NOTES_FETCH_KEY)
}
