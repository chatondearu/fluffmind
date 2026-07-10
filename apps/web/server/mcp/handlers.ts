import type { GraphData, NoteSummary, ResolvedLink } from '../vault/index'
import { getGraph } from '../vault/index'
import { readNote } from '../vault/reader'
import { getVaultIndex, invalidateVaultIndex } from '../vault/service'
import { writeToWorkspace, GitConflictError, InvalidNoteIdError } from '../vault/write'
import type { McpContext } from './context'

export interface SearchNotesResult {
  id: string
  title: string
}

export interface ReadNoteResult {
  id: string
  title: string
  frontmatter: Record<string, unknown>
  content: string
}

export interface WriteNoteResult {
  committed: boolean
  pushed: boolean
}

export interface ListBacklinksResult {
  id: string
  title: string
}

export interface CreateTaskResult {
  noteId: string
  content: string
}

function toTextPayload(value: unknown): { content: [{ type: 'text', text: string }] } {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  }
}

export function toolError(message: string): { content: [{ type: 'text', text: string }], isError: true } {
  return { content: [{ type: 'text', text: message }], isError: true }
}

/** Case-insensitive search on note id and title. */
export async function searchNotes(
  query: string,
  limit = 20,
  workspaceId = 'default',
): Promise<SearchNotesResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const index = await getVaultIndex(workspaceId)
  const needle = trimmed.toLowerCase()
  const results: SearchNotesResult[] = []

  for (const note of index.notes.values()) {
    if (note.id.toLowerCase().includes(needle) || note.title.toLowerCase().includes(needle)) {
      results.push({ id: note.id, title: note.title })
    }
  }

  return results
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, Math.max(1, Math.min(limit, 100)))
}

/** Read a note's markdown body and metadata. */
export async function readNoteById(id: string, workspaceId = 'default'): Promise<ReadNoteResult | null> {
  const index = await getVaultIndex(workspaceId)
  const note = await readNote(index, id)
  if (!note) return null
  return {
    id: note.id,
    title: note.title,
    frontmatter: note.frontmatter,
    content: note.content,
  }
}

/** Create or update a note through the single write path. */
export async function writeNoteContent(
  ctx: McpContext,
  id: string,
  content: string,
): Promise<WriteNoteResult> {
  return writeToWorkspace(ctx.workspaceId, id, content)
}

/** List notes that link to the given note id. */
export async function listBacklinks(id: string, workspaceId = 'default'): Promise<ListBacklinksResult[]> {
  const index = await getVaultIndex(workspaceId)
  if (!index.notes.has(id)) return []

  return (index.backlinks.get(id) ?? [])
    .map((backlinkId) => index.notes.get(backlinkId))
    .filter((note): note is NoteSummary => note != null)
    .map((note) => ({ id: note.id, title: note.title }))
    .sort((a, b) => a.title.localeCompare(b.title))
}

/** Return the vault wikilink graph. */
export async function getVaultGraph(workspaceId = 'default'): Promise<GraphData> {
  const index = await getVaultIndex(workspaceId)
  return getGraph(index)
}

/** Append an unchecked task line to a note (creates inbox/tasks when missing). */
export async function createTask(
  ctx: McpContext,
  text: string,
  noteId = 'inbox/tasks',
): Promise<CreateTaskResult> {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('Task text is required.')
  }

  const index = await getVaultIndex(ctx.workspaceId)
  const existing = await readNote(index, noteId)
  const taskLine = `- [ ] ${trimmed}`

  const content = existing
    ? `${existing.content.trimEnd()}\n${taskLine}\n`
    : `# Tasks\n\n${taskLine}\n`

  await writeToWorkspace(ctx.workspaceId, noteId, content)
  return { noteId, content }
}

export function formatHandlerError(error: unknown): ReturnType<typeof toolError> {
  if (error instanceof GitConflictError) {
    return toolError(`Git conflict: ${error.message}`)
  }
  if (error instanceof InvalidNoteIdError) {
    return toolError(error.message)
  }
  if (error instanceof Error) {
    return toolError(error.message)
  }
  return toolError('Unexpected error.')
}

export { toTextPayload, type ResolvedLink, invalidateVaultIndex }
