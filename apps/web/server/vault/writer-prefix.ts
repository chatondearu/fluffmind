/**
 * Path ownership prefixes (ADR-017 / PRD-042).
 *
 * Logical writer: `device:<id>` | `agent:<id>` | `user:<id>`
 * On-disk prefix: `writers/<kind>/<id>/…` (id = sanitized segment, no slashes).
 */

export type WriterKind = 'device' | 'agent' | 'user'

export interface WriterIdentity {
  kind: WriterKind
  id: string
}

export class WriterPrefixViolationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WriterPrefixViolationError'
  }
}

export class InvalidWriterIdentityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidWriterIdentityError'
  }
}

const KIND_SET = new Set<WriterKind>(['device', 'agent', 'user'])

/** Sanitize the id segment: alphanumeric, `.`, `_`, `-` only. */
export function sanitizeWriterId(raw: string): string {
  const trimmed = raw.trim()
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

export function parseWriterIdentity(raw: unknown): WriterIdentity {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new InvalidWriterIdentityError('Writer identity is required (device|agent|user:<id>)')
  }
  const trimmed = raw.trim()
  const colon = trimmed.indexOf(':')
  if (colon <= 0) {
    throw new InvalidWriterIdentityError('Writer identity must look like kind:id')
  }
  const kind = trimmed.slice(0, colon) as WriterKind
  if (!KIND_SET.has(kind)) {
    throw new InvalidWriterIdentityError('Writer kind must be device, agent, or user')
  }
  return { kind, id: sanitizeWriterId(trimmed.slice(colon + 1)) }
}

/** Vault-relative note-id prefix without trailing slash, e.g. `writers/user/alice`. */
export function writerPathPrefix(writer: WriterIdentity): string {
  const id = sanitizeWriterId(writer.id)
  if (!KIND_SET.has(writer.kind)) {
    throw new InvalidWriterIdentityError('Writer kind must be device, agent, or user')
  }
  return `writers/${writer.kind}/${id}`
}

/** True when the note id sits under the reserved `writers/` tree. */
export function isUnderWritersTree(noteId: string): boolean {
  const id = noteId.trim().replace(/^\/+/, '')
  return id === 'writers' || id.startsWith('writers/')
}

/**
 * Note id must equal the writer prefix or live under it.
 * Canonical vault-root paths are rejected (publish is a separate API — T4).
 */
export function assertNoteIdWritableByWriter(noteId: string, writer: WriterIdentity): void {
  const prefix = writerPathPrefix(writer)
  const id = noteId.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (id === prefix || id.startsWith(`${prefix}/`))
    return
  throw new WriterPrefixViolationError(
    `Note "${noteId}" is outside writer prefix "${prefix}/" (canonical paths require explicit publish)`,
  )
}
