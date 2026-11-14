/**
 * Bind a MeshSyncTransport to a workspace: local mesh-live writes publish;
 * remote updates apply to disk (LWW by mtimeMs) + invalidate/WS.
 * No-op when no transport is bound (default until MESH_TCP_* / tests).
 */
import { mkdir, readFile, stat, writeFile, utimes } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { MeshFileUpdate, MeshSyncTransport } from '@fluffmind/integrations'
import { assertWithinContentRoots } from './content-roots'
import { InvalidNoteIdError, resolveNoteFilePath } from './note-id'
import { invalidateVaultIndex } from './service'
import { publishVaultInvalidate } from './vault-invalidate'
import { resolveWorkspaceConfig } from './workspace'

type BoundPeer = {
  transport: MeshSyncTransport
  unsub: () => void
}

const peers = new Map<string, BoundPeer>()

/** Paths currently being applied from the mesh — skip re-publish (echo). */
const applying = new Set<string>()

export function meshPathForNoteId(noteId: string): string {
  const id = noteId.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  return id.endsWith('.md') ? id : `${id}.md`
}

export function noteIdFromMeshPath(path: string): string {
  const trimmed = path.trim().replace(/^\/+/, '')
  if (!trimmed)
    throw new InvalidNoteIdError('Mesh path is empty')
  return trimmed.replace(/\.md$/i, '')
}

export function getWorkspaceMeshTransport(workspaceId: string): MeshSyncTransport | undefined {
  return peers.get(workspaceId)?.transport
}

/**
 * Attach a transport. Replaces any previous binding for this workspace.
 * Subscribes applyMeshFileUpdate for remote updates.
 */
export function bindWorkspaceMeshTransport(
  workspaceId: string,
  transport: MeshSyncTransport,
): void {
  unbindWorkspaceMeshTransport(workspaceId)
  const unsub = transport.onUpdate((update) => {
    void applyMeshFileUpdate(workspaceId, update).catch((error: unknown) => {
      console.error(`[mesh-apply] failed for ${workspaceId}:`, error)
    })
  })
  peers.set(workspaceId, { transport, unsub })
}

export async function unbindWorkspaceMeshTransport(workspaceId: string): Promise<void> {
  const prev = peers.get(workspaceId)
  if (!prev)
    return
  prev.unsub()
  peers.delete(workspaceId)
  try {
    await prev.transport.close()
  }
  catch {
    // already closed
  }
}

/** Publish a local note write to peers. Silent no-op if unbound. */
export async function publishLocalMeshNote(
  workspaceId: string,
  noteId: string,
  content: string,
  mtimeMs: number = Date.now(),
): Promise<void> {
  if (applying.has(`${workspaceId}:${noteId}`))
    return
  const transport = peers.get(workspaceId)?.transport
  if (!transport)
    return
  await transport.publish({
    path: meshPathForNoteId(noteId),
    content,
    mtimeMs,
  })
}

/**
 * Apply a remote whole-file update (LWW). Skips if local mtime is newer.
 * Does not re-publish to the mesh.
 */
export async function applyMeshFileUpdate(
  workspaceId: string,
  update: MeshFileUpdate,
): Promise<{ applied: boolean, noteId: string }> {
  const noteId = noteIdFromMeshPath(update.path)
  const config = await resolveWorkspaceConfig(workspaceId)
  assertWithinContentRoots(noteId, config.contentRoots)
  const filePath = resolveNoteFilePath(config.path, noteId)

  try {
    const existing = await stat(filePath)
    const localMtimeMs = Math.trunc(existing.mtimeMs)
    if (localMtimeMs > update.mtimeMs)
      return { applied: false, noteId }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw error
  }

  const key = `${workspaceId}:${noteId}`
  applying.add(key)
  try {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, update.content, 'utf-8')
    const atime = new Date()
    const mtime = new Date(update.mtimeMs)
    await utimes(filePath, atime, mtime)
  }
  finally {
    applying.delete(key)
  }

  invalidateVaultIndex(workspaceId)
  publishVaultInvalidate(workspaceId, { reason: 'note-write', noteId })
  return { applied: true, noteId }
}

/** Test helper: read back file after apply. */
export async function readVaultNoteRaw(workspaceId: string, noteId: string): Promise<string> {
  const config = await resolveWorkspaceConfig(workspaceId)
  return readFile(resolveNoteFilePath(config.path, noteId), 'utf-8')
}
