import { access, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { commitAndPush, ensureWorkingCopy } from '@fluffmind/integrations'
import { assertWithinContentRoots } from './content-roots'
import { FOLDER_MARKER } from './folders'
import { type MeshChange, publishMeshChanges } from './mesh-peer-bootstrap'
import { InvalidNoteIdError, resolveNoteFilePath } from './note-id'
import { invalidateVaultIndex } from './service'
import { publishVaultInvalidate, type VaultInvalidateReason } from './vault-invalidate'
import { resolveWorkspaceConfig, resolveWorkspaceGitNetwork } from './workspace'
import { withWorkspaceWriteLock } from './write'
import { assertNoteIdWritableByWriter, isUnderWritersTree, parseWriterIdentity } from './writer-prefix'

export class VaultConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultConflictError'
  }
}

type MutationInvalidate = {
  reason: VaultInvalidateReason
  noteId?: string
}

/**
 * Tell the daemon about removed/new notes after a mesh-live mutation (best-effort).
 * `writer` is the session writer; auth-off solo falls back to the device id.
 */
/**
 * mesh-live (ADR-017): drafts belong to their writer, and only the publish action turns a
 * draft canonical — a rename must not smuggle one past the canPublish grant.
 */
function assertMeshMutation(syncMode: string, writer: string | undefined, from: string, to?: string) {
  if (syncMode !== 'mesh-live' || !isUnderWritersTree(from))
    return
  if (writer)
    assertNoteIdWritableByWriter(from, parseWriterIdentity(writer))
  if (to !== undefined && !isUnderWritersTree(to))
    throw new InvalidNoteIdError('Publish a draft with the publish action; it cannot be renamed onto a canonical path')
}

async function notifyMesh(workspaceId: string, writer: string | undefined, changes: MeshChange[]) {
  const solo = `device:${process.env.SYNC_WRITER_DEVICE?.trim() || 'solo'}`
  await publishMeshChanges(workspaceId, writer ?? solo, changes)
}

async function commitMutation(
  workspaceId: string,
  message: string,
  invalidate: MutationInvalidate = { reason: 'index' },
) {
  const config = await resolveWorkspaceConfig(workspaceId)

  // Mesh-live: persist files only — Git is export/backup, not the live path (ADR-016/018).
  if (config.syncMode === 'mesh-live') {
    invalidateVaultIndex(workspaceId)
    publishVaultInvalidate(workspaceId, invalidate)
    return { committed: false, pushed: false }
  }

  const network = await resolveWorkspaceGitNetwork(workspaceId)
  const git = await ensureWorkingCopy({ ...config, accessToken: network.accessToken })
  const result = await commitAndPush(git, {
    branch: config.branch,
    message,
    remoteConfigured: Boolean(config.remoteUrl),
    accessToken: network.accessToken,
  })
  invalidateVaultIndex(workspaceId)
  publishVaultInvalidate(workspaceId, invalidate)
  return result
}

export async function deleteNoteFromWorkspace(workspaceId: string, id: string, writer?: string) {
  return withWorkspaceWriteLock(workspaceId, async () => {
    const config = await resolveWorkspaceConfig(workspaceId)
    assertWithinContentRoots(id, config.contentRoots)
    assertMeshMutation(config.syncMode, writer, id)
    const filePath = resolveNoteFilePath(config.path, id)
    await rm(filePath, { force: true })
    if (config.syncMode === 'mesh-live')
      await notifyMesh(workspaceId, writer, [{ noteId: id, deleted: true }])
    return commitMutation(workspaceId, `Delete ${id}`, { reason: 'note-write', noteId: id })
  })
}

export async function renameNoteInWorkspace(workspaceId: string, id: string, newId: string, writer?: string) {
  const trimmed = newId.trim()
  if (!trimmed || trimmed === id) {
    throw new InvalidNoteIdError('New note id is required')
  }

  return withWorkspaceWriteLock(workspaceId, async () => {
    const config = await resolveWorkspaceConfig(workspaceId)
    assertWithinContentRoots(id, config.contentRoots)
    assertWithinContentRoots(trimmed, config.contentRoots)
    assertMeshMutation(config.syncMode, writer, id, trimmed)
    const fromPath = resolveNoteFilePath(config.path, id)
    const toPath = resolveNoteFilePath(config.path, trimmed)

    try {
      await access(toPath)
      throw new VaultConflictError('Target note already exists')
    } catch (error) {
      if (!(error instanceof VaultConflictError) && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      if (error instanceof VaultConflictError) throw error
    }

    await mkdir(dirname(toPath), { recursive: true })
    await rename(fromPath, toPath)
    if (config.syncMode === 'mesh-live')
      await notifyMesh(workspaceId, writer, [{ noteId: id, deleted: true }, { noteId: trimmed }])
    const result = await commitMutation(workspaceId, `Rename ${id} -> ${trimmed}`, {
      reason: 'note-write',
      noteId: trimmed,
    })
    return { ...result, id: trimmed }
  })
}

export async function renameVaultFolder(workspaceId: string, oldPath: string, newPath: string, writer?: string) {
  validateFolderPath(oldPath)
  validateFolderPath(newPath)
  if (oldPath === newPath) {
    throw new InvalidNoteIdError('Folder path unchanged')
  }

  return withWorkspaceWriteLock(workspaceId, async () => {
    const config = await resolveWorkspaceConfig(workspaceId)
    assertWithinContentRoots(oldPath, config.contentRoots)
    assertWithinContentRoots(newPath, config.contentRoots)
    assertMeshMutation(config.syncMode, writer, oldPath, newPath)
    const fromDir = join(config.path, ...oldPath.split('/'))
    const toDir = join(config.path, ...newPath.split('/'))

    try {
      await access(toDir)
      throw new VaultConflictError('Target folder already exists')
    } catch (error) {
      if (!(error instanceof VaultConflictError) && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      if (error instanceof VaultConflictError) throw error
    }

    const meshNoteIds = config.syncMode === 'mesh-live' ? await listNoteIds(config.path, fromDir) : []
    await mkdir(dirname(toDir), { recursive: true })
    await rename(fromDir, toDir)
    await notifyMesh(workspaceId, writer, [
      ...meshNoteIds.map(noteId => ({ noteId, deleted: true })),
      ...meshNoteIds.map(noteId => ({ noteId: `${newPath}${noteId.slice(oldPath.length)}` })),
    ])
    const result = await commitMutation(workspaceId, `Rename folder ${oldPath} -> ${newPath}`)
    return { ...result, path: newPath }
  })
}

export async function deleteVaultFolder(workspaceId: string, folderPath: string, recursive = false, writer?: string) {
  validateFolderPath(folderPath)

  return withWorkspaceWriteLock(workspaceId, async () => {
    const config = await resolveWorkspaceConfig(workspaceId)
    assertWithinContentRoots(folderPath, config.contentRoots)
    assertMeshMutation(config.syncMode, writer, folderPath)
    const dirPath = join(config.path, ...folderPath.split('/'))
    const noteIds = recursive ? await listNoteIds(config.path, dirPath) : []
    const noteCount = noteIds.length

    if (recursive) {
      await rm(dirPath, { recursive: true, force: true })
    } else {
      const entries = await readdir(dirPath)
      const meaningful = entries.filter(name => name !== FOLDER_MARKER)
      if (meaningful.length > 0) {
        throw new VaultConflictError('Folder is not empty')
      }
      await rm(join(dirPath, FOLDER_MARKER), { force: true })
      await rm(dirPath, { recursive: true, force: true })
    }

    if (config.syncMode === 'mesh-live')
      await notifyMesh(workspaceId, writer, noteIds.map(noteId => ({ noteId, deleted: true })))
    const result = await commitMutation(workspaceId, `Delete folder ${folderPath}`)
    return { ...result, deletedNotes: noteCount }
  })
}

function validateFolderPath(folderPath: string) {
  const segments = folderPath.split('/').filter(Boolean)
  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      throw new InvalidNoteIdError('Invalid folder path')
    }
  }
  if (segments.length === 0) {
    throw new InvalidNoteIdError('Folder path is required')
  }
}

/** Note ids (vault-relative, no `.md`) of every markdown file under `dirPath`. */
async function listNoteIds(vaultPath: string, dirPath: string): Promise<string[]> {
  const ids: string[] = []

  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === '.git') continue
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        ids.push(relative(vaultPath, full).split(sep).join('/').slice(0, -'.md'.length))
      }
    }
  }

  try {
    await stat(dirPath)
    await walk(dirPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  return ids
}
