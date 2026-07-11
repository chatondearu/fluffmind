import type { NoteSummary } from '../../server/vault/index'

import { buildVaultTree, type VaultTreeNode } from '../utils/vault-tree'

const NOTES_FETCH_KEY = 'vault-notes'

function storageKey(workspaceId: string): string {
  return `fluffmind-sidebar-expanded:${workspaceId}`
}

function readExpanded(workspaceId: string): Set<string> {
  if (!import.meta.client) return new Set()
  try {
    const raw = localStorage.getItem(storageKey(workspaceId))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((value): value is string => typeof value === 'string'))
  } catch {
    return new Set()
  }
}

function writeExpanded(workspaceId: string, paths: Set<string>) {
  if (!import.meta.client) return
  localStorage.setItem(storageKey(workspaceId), JSON.stringify([...paths]))
}

export function useVaultTree(workspaceId = 'default') {
  const { data, pending, refresh } = useFetch<{ notes: NoteSummary[] }>('/api/notes', {
    key: NOTES_FETCH_KEY,
  })

  const expandedPaths = ref<Set<string>>(readExpanded(workspaceId))

  const tree = computed<VaultTreeNode[]>(() =>
    buildVaultTree(data.value?.notes ?? []),
  )

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

  watch(
    () => workspaceId,
    (id) => {
      expandedPaths.value = readExpanded(id)
    },
  )

  return {
    tree,
    pending,
    expandedPaths,
    isExpanded,
    toggleFolder,
    ensureExpanded,
    refreshTree,
  }
}

export async function refreshVaultNotes() {
  await refreshNuxtData(NOTES_FETCH_KEY)
}
