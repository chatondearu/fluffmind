import { readFile } from 'node:fs/promises'
import type { Root } from 'mdast'
import { parseNote } from './parser'
import type { NoteSummary, VaultIndex } from './index'

export interface NoteDetail extends NoteSummary {
  content: string
  ast: Root
}

/**
 * Reads a single note's full content by id, re-parsing it fresh from disk.
 *
 * Strictly read-only — there is no writeNote counterpart here. Git sync and the
 * single-writer-per-workspace write path (writeToWorkspace) land in P1; until then
 * the vault is navigable but not editable.
 */
export async function readNote(index: VaultIndex, id: string): Promise<NoteDetail | null> {
  const summary = index.notes.get(id)
  if (!summary) return null
  const raw = await readFile(summary.filePath, 'utf-8')
  const { frontmatter, content, ast } = parseNote(raw)
  return { ...summary, frontmatter, content, ast }
}
