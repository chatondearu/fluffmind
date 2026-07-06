import { readFile, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { toString as mdastToString } from 'mdast-util-to-string'
import { visit } from 'unist-util-visit'
import type { Heading, Root } from 'mdast'
import { parseNote } from './parser'
import { extractWikilinks } from './wikilinks'

export interface NoteSummary {
  /** Relative path from the vault root, no extension, POSIX separators — e.g. "projets/index". */
  id: string
  title: string
  frontmatter: Record<string, unknown>
  /** Absolute path on disk. */
  filePath: string
}

export interface ResolvedLink {
  target: string
  alias?: string
  /** Note id if the target resolved to a real note, null for a dead link. */
  resolvedId: string | null
}

export interface VaultIndex {
  notes: Map<string, NoteSummary>
  /** Outgoing links per note id. */
  links: Map<string, ResolvedLink[]>
  /** Ids of notes linking to a given note id. */
  backlinks: Map<string, string[]>
}

export interface GraphNode {
  id: string
  title: string
}

export interface GraphEdge {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.obsidian', '.vscode', '.foam'])

function toNoteId(vaultPath: string, filePath: string): string {
  return relative(vaultPath, filePath).replace(/\.md$/, '').split(sep).join('/')
}

function extractTitle(ast: Root, fallback: string): string {
  let title: string | undefined
  visit(ast, 'heading', (node: Heading) => {
    if (title == null) title = mdastToString(node)
    return false
  })
  return title?.trim() || fallback
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await findMarkdownFiles(fullPath)))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath)
    }
  }
  return files
}

/**
 * Resolves a raw wikilink target to a note id: exact id match first, falling back to
 * matching by basename when exactly one note has it (mirrors basic Foam/Obsidian
 * short-link behavior). Returns null (dead link) otherwise.
 */
function resolveTarget(target: string, noteIds: string[], basenameIndex: Map<string, string[]>): string | null {
  if (noteIds.includes(target)) return target
  const basename = target.split('/').pop()!
  const candidates = basenameIndex.get(basename)
  return candidates?.length === 1 ? candidates[0]! : null
}

/**
 * Walks `vaultPath` for markdown files and builds the in-memory vault index
 * (notes, resolved links, backlinks). Read-only — never writes to disk.
 */
export async function buildVaultIndex(vaultPath: string): Promise<VaultIndex> {
  const files = await findMarkdownFiles(vaultPath)

  const notes = new Map<string, NoteSummary>()
  const rawLinksByNote = new Map<string, ReturnType<typeof extractWikilinks>>()

  for (const filePath of files) {
    const id = toNoteId(vaultPath, filePath)
    const raw = await readFile(filePath, 'utf-8')
    const { frontmatter, ast } = parseNote(raw)
    notes.set(id, { id, title: extractTitle(ast, id), frontmatter, filePath })
    rawLinksByNote.set(id, extractWikilinks(ast))
  }

  const noteIds = [...notes.keys()]
  const basenameIndex = new Map<string, string[]>()
  for (const id of noteIds) {
    const basename = id.split('/').pop()!
    basenameIndex.set(basename, [...(basenameIndex.get(basename) ?? []), id])
  }

  const links = new Map<string, ResolvedLink[]>()
  const backlinks = new Map<string, string[]>(noteIds.map((id) => [id, []]))

  for (const [id, rawLinks] of rawLinksByNote) {
    const resolved = rawLinks.map((link) => ({
      ...link,
      resolvedId: resolveTarget(link.target, noteIds, basenameIndex)
    }))
    links.set(id, resolved)
    for (const link of resolved) {
      if (link.resolvedId != null && link.resolvedId !== id) {
        backlinks.get(link.resolvedId)!.push(id)
      }
    }
  }

  return { notes, links, backlinks }
}

export function getGraph(index: VaultIndex): GraphData {
  const nodes = [...index.notes.values()].map((note) => ({ id: note.id, title: note.title }))
  const edges: GraphEdge[] = []
  for (const [source, resolvedLinks] of index.links) {
    for (const link of resolvedLinks) {
      if (link.resolvedId != null) edges.push({ source, target: link.resolvedId })
    }
  }
  return { nodes, edges }
}
