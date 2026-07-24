import { access, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { commitAndPush, ensureWorkingCopy } from '@fluffmind/integrations'
import { FOLDER_MARKER } from './folders'
import { InvalidNoteIdError, resolveNoteFilePath } from './note-id'
import { invalidateVaultIndex } from './service'
import { resolveWorkspaceConfig, resolveWorkspaceGitRemoteUrl } from './workspace'
import { withWorkspaceWriteLock } from './write'

export class VaultConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultConflictError'
  }
}

async function commitMutation(workspaceId: string, message: string) {
  const config = await resolveWorkspaceConfig(workspaceId)
  const remoteUrl = await resolveWorkspaceGitRemoteUrl(workspaceId)
  const git = await ensureWorkingCopy({ ...config, networkRemoteUrl: remoteUrl })
  const result = await commitAndPush(git, {
    branch: config.branch,
    message,
    remoteConfigured: Boolean(config.remoteUrl),
    networkRemoteUrl: remoteUrl,
  })
  invalidateVaultIndex(workspaceId)
  return result
}

export async function deleteNoteFromWorkspace(workspaceId: string, id: string) {
  return withWorkspaceWriteLock(workspaceId, async () => {
    const config = await resolveWorkspaceConfig(workspaceId)
    const filePath = resolveNoteFilePath(config.path, id)
    await rm(filePath, { force: true })
    return commitMutation(workspaceId, `Delete ${id}`)
  })
}

export async function renameNoteInWorkspace(workspaceId: string, id: string, newId: string) {
  const trimmed = newId.trim()
  if (!trimmed || trimmed === id) {
    throw new InvalidNoteIdError('New note id is required')
  }

  return withWorkspaceWriteLock(workspaceId, async () => {
    const config = await resolveWorkspaceConfig(workspaceId)
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
    const result = await commitMutation(workspaceId, `Rename ${id} -> ${trimmed}`)
    return { ...result, id: trimmed }
  })
}

export async function renameVaultFolder(workspaceId: string, oldPath: string, newPath: string) {
  validateFolderPath(oldPath)
  validateFolderPath(newPath)
  if (oldPath === newPath) {
    throw new InvalidNoteIdError('Folder path unchanged')
  }

  return withWorkspaceWriteLock(workspaceId, async () => {
    const config = await resolveWorkspaceConfig(workspaceId)
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

    await mkdir(dirname(toDir), { recursive: true })
    await rename(fromDir, toDir)
    const result = await commitMutation(workspaceId, `Rename folder ${oldPath} -> ${newPath}`)
    return { ...result, path: newPath }
  })
}

export async function deleteVaultFolder(workspaceId: string, folderPath: string, recursive = false) {
  validateFolderPath(folderPath)

  return withWorkspaceWriteLock(workspaceId, async () => {
    const config = await resolveWorkspaceConfig(workspaceId)
    const dirPath = join(config.path, ...folderPath.split('/'))
    const noteCount = recursive ? await countMarkdownFiles(dirPath) : 0

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

async function countMarkdownFiles(dirPath: string): Promise<number> {
  let count = 0

  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === '.git') continue
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        count += 1
      }
    }
  }

  try {
    await stat(dirPath)
    await walk(dirPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
    throw error
  }

  return count
}
