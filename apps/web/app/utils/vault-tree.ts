import { isKanbanBoard } from '@fluffmind/kanban'

import type { NoteSummary } from '../../server/vault/index'

export interface VaultTreeNode {
  kind: 'folder' | 'page'
  /** Display label (last path segment). */
  name: string
  /** Folder path (no trailing slash) or full note id for pages. */
  path: string
  noteId?: string
  href: string
  title: string
  children: VaultTreeNode[]
}

interface MutableFolder {
  kind: 'folder'
  name: string
  path: string
  children: Map<string, MutableFolder | MutablePage>
}

interface MutablePage {
  kind: 'page'
  name: string
  path: string
  noteId: string
  href: string
  title: string
}

function noteHref(note: NoteSummary): string {
  if (isKanbanBoard(note.frontmatter)) {
    return `/boards/${note.id}`
  }
  return `/notes/${note.id}`
}

function compareNodes(a: VaultTreeNode, b: VaultTreeNode): number {
  if (a.kind !== b.kind) {
    return a.kind === 'folder' ? -1 : 1
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

function mutableToNodes(map: Map<string, MutableFolder | MutablePage>): VaultTreeNode[] {
  const nodes: VaultTreeNode[] = []

  for (const entry of map.values()) {
    if (entry.kind === 'folder') {
      nodes.push({
        kind: 'folder',
        name: entry.name,
        path: entry.path,
        href: '',
        title: entry.name,
        children: mutableToNodes(entry.children),
      })
    } else {
      nodes.push({
        kind: 'page',
        name: entry.name,
        path: entry.path,
        noteId: entry.noteId,
        href: entry.href,
        title: entry.title,
        children: [],
      })
    }
  }

  return nodes.sort(compareNodes)
}

function getOrCreateFolder(
  root: Map<string, MutableFolder | MutablePage>,
  segments: string[],
): Map<string, MutableFolder | MutablePage> {
  let current = root

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!
    const folderPath = segments.slice(0, index + 1).join('/')
    const existing = current.get(segment)

    if (existing?.kind === 'folder') {
      current = existing.children
      continue
    }

    const folder: MutableFolder = {
      kind: 'folder',
      name: segment,
      path: folderPath,
      children: new Map(),
    }
    current.set(segment, folder)
    current = folder.children
  }

  return current
}

/** Builds a virtual folder tree from flat note summaries (vault paths). */
export function buildVaultTree(notes: NoteSummary[]): VaultTreeNode[] {
  const root = new Map<string, MutableFolder | MutablePage>()

  for (const note of notes) {
    const segments = note.id.split('/').filter(Boolean)
    if (segments.length === 0) continue

    const pageName = segments[segments.length - 1]!
    const folderSegments = segments.slice(0, -1)
    const parent = folderSegments.length > 0
      ? getOrCreateFolder(root, folderSegments)
      : root

    parent.set(pageName, {
      kind: 'page',
      name: pageName,
      path: note.id,
      noteId: note.id,
      href: noteHref(note),
      title: note.title,
    })
  }

  return mutableToNodes(root)
}

export function sanitizeFolderQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/^\/+|\/+$/g, '')
  if (!trimmed) return null

  const segments = trimmed.split('/')
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') {
      return null
    }
  }

  return trimmed
}

export function prefixNoteId(slug: string, folder: string | null): string {
  if (!folder) return slug
  return `${folder}/${slug}`
}
