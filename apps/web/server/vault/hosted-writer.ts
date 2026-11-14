import type { H3Event } from 'h3'
import { getSession, isAuthEnabled, requireSession } from '../utils/auth'
import {
  type WriterIdentity,
  assertNoteIdWritableByWriter,
  isUnderWritersTree,
  writerPathPrefix,
} from './writer-prefix'

/** Hosted browser / session member → `user:<id>` (ADR-019). */
export function writerIdentityForUser(userId: string): WriterIdentity {
  return { kind: 'user', id: userId }
}

/** Agent bearer token → `agent:<tokenId>`. */
export function writerIdentityForAgent(tokenId: string): WriterIdentity {
  return { kind: 'agent', id: tokenId }
}

/**
 * Auth-off / portable solo without a daemon device id yet.
 * Override with `SYNC_WRITER_DEVICE` (sanitized id segment).
 */
export function writerIdentityForSoloDevice(): WriterIdentity {
  const fromEnv = process.env.SYNC_WRITER_DEVICE?.trim()
  return { kind: 'device', id: fromEnv && fromEnv.length > 0 ? fromEnv : 'solo' }
}

/**
 * Resolve the writer for a browser (or auth-off) request.
 * Same user ⇒ same prefix across tabs; distinct users ⇒ distinct prefixes.
 */
export async function resolveSessionWriter(event: H3Event): Promise<WriterIdentity> {
  if (!isAuthEnabled())
    return writerIdentityForSoloDevice()

  const session = await requireSession(event)
  return writerIdentityForUser(session.user.id)
}

/**
 * On mesh-live, note ids that are not already under `writers/` are rewritten
 * under the actor prefix so existing clients keep sending short ids as drafts.
 * Ids already under `writers/` must belong to this writer.
 */
export function noteIdForMeshWriter(noteId: string, writer: WriterIdentity): string {
  const id = noteId.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (isUnderWritersTree(id)) {
    assertNoteIdWritableByWriter(id, writer)
    return id
  }
  return `${writerPathPrefix(writer)}/${id}`
}
