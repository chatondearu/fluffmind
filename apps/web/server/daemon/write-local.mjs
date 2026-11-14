/**
 * Mesh-live local vault writes for the portable daemon (ADR-016 / PLAN-042 T7).
 * No Git commit/push — files only, under writers/<kind>/<id>/.
 */
import { createHash } from 'node:crypto'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

const KIND_SET = new Set(['device', 'agent', 'user'])

export class InvalidWriterIdentityError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InvalidWriterIdentityError'
  }
}

export class WriterPrefixViolationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'WriterPrefixViolationError'
  }
}

export class InvalidNoteIdError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InvalidNoteIdError'
  }
}

export function sanitizeWriterId(raw) {
  const trimmed = String(raw).trim()
  if (!trimmed) {
    throw new InvalidWriterIdentityError('Writer id is required')
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    throw new InvalidWriterIdentityError(
      'Writer id must contain only letters, digits, ".", "_", or "-"',
    )
  }
  return trimmed
}

/** Parse `device|agent|user:<id>` (default solo device when omitted upstream). */
export function parseWriterIdentity(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new InvalidWriterIdentityError('Writer identity is required (device|agent|user:<id>)')
  }
  const trimmed = raw.trim()
  const colon = trimmed.indexOf(':')
  if (colon <= 0) {
    throw new InvalidWriterIdentityError('Writer identity must look like kind:id')
  }
  const kind = trimmed.slice(0, colon)
  if (!KIND_SET.has(kind)) {
    throw new InvalidWriterIdentityError('Writer kind must be device, agent, or user')
  }
  return { kind, id: sanitizeWriterId(trimmed.slice(colon + 1)) }
}

export function writerPathPrefix(writer) {
  return `writers/${writer.kind}/${sanitizeWriterId(writer.id)}`
}

export function isUnderWritersTree(noteId) {
  const id = noteId.trim().replace(/^\/+/, '')
  return id === 'writers' || id.startsWith('writers/')
}

export function assertNoteIdWritableByWriter(noteId, writer) {
  const prefix = writerPathPrefix(writer)
  const id = noteId.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (id === prefix || id.startsWith(`${prefix}/`))
    return
  throw new WriterPrefixViolationError(
    `Note "${noteId}" is outside writer prefix "${prefix}/"`,
  )
}

/** Short ids become drafts under the writer prefix (mesh-live client shape). */
export function noteIdForMeshWriter(noteId, writer) {
  const id = noteId.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (isUnderWritersTree(id)) {
    assertNoteIdWritableByWriter(id, writer)
    return id
  }
  return `${writerPathPrefix(writer)}/${id}`
}

export function resolveNoteFilePath(vaultPath, id) {
  const trimmed = id.trim()
  if (!trimmed)
    throw new InvalidNoteIdError('Note id is required')
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
    if (!segment)
      throw new InvalidNoteIdError('Note id must not contain empty path segments')
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

function sha256Hex(raw) {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

/**
 * Write a note under the vault with writer-prefix enforcement. No Git.
 * @returns {{ id: string, path: string, contentHash: string, created: boolean }}
 */
export async function writeNoteLocal({ vaultPath, id, content, writer }) {
  const identity = typeof writer === 'string' ? parseWriterIdentity(writer) : writer
  const noteId = noteIdForMeshWriter(id, identity)
  assertNoteIdWritableByWriter(noteId, identity)

  const filePath = resolveNoteFilePath(vaultPath, noteId)
  let created = false
  try {
    await access(filePath)
  }
  catch (error) {
    if (error?.code !== 'ENOENT')
      throw error
    await mkdir(dirname(filePath), { recursive: true })
    created = true
  }

  const raw = String(content ?? '')
  await writeFile(filePath, raw, 'utf-8')
  return {
    id: noteId,
    path: filePath,
    contentHash: sha256Hex(raw),
    created,
    committed: false,
    pushed: false,
  }
}
