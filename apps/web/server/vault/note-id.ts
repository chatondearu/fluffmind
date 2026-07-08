import { isAbsolute, join, relative, resolve } from 'node:path'

export class InvalidNoteIdError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidNoteIdError'
  }
}

/**
 * Maps a vault note id (POSIX path without extension, e.g. "projets/index") to an absolute
 * file path under `vaultPath`. Rejects traversal and other unsafe ids — the id is
 * caller-supplied on create, unlike edits that trust an already-indexed entry.
 */
export function resolveNoteFilePath(vaultPath: string, id: string): string {
  const trimmed = id.trim()
  if (!trimmed) throw new InvalidNoteIdError('Note id is required')
  if (trimmed.includes('\\') || trimmed.includes('\0')) {
    throw new InvalidNoteIdError('Note id must use forward slashes only')
  }
  if (trimmed.startsWith('/') || trimmed.endsWith('/')) {
    throw new InvalidNoteIdError('Note id must not start or end with a slash')
  }
  if (trimmed.endsWith('.md')) {
    throw new InvalidNoteIdError('Note id must not include the .md extension')
  }

  const segments = trimmed.split('/')
  for (const segment of segments) {
    if (!segment) throw new InvalidNoteIdError('Note id must not contain empty path segments')
    if (segment === '.' || segment === '..') {
      throw new InvalidNoteIdError('Note id must not contain "." or ".." segments')
    }
  }

  const vaultRoot = resolve(vaultPath)
  const filePath = resolve(`${join(vaultRoot, ...segments)}.md`)
  const rel = relative(vaultRoot, filePath)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new InvalidNoteIdError('Note id escapes the vault root')
  }

  return filePath
}
