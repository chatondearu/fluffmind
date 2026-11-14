import { access, mkdir, readdir, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { commitAndPush, ensureWorkingCopy } from '@fluffmind/integrations'
import { assertWithinContentRoots } from './content-roots'
import { InvalidNoteIdError } from './note-id'
import { invalidateVaultIndex } from './service'
import { publishVaultInvalidate } from './vault-invalidate'
import { withWorkspaceWriteLock } from './write'
import { resolveWorkspaceConfig, resolveWorkspaceGitNetwork } from './workspace'

export const FOLDER_MARKER = '.fluffmind-folder'

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.obsidian', '.vscode', '.foam'])

function toPosixPath(vaultPath: string, dirPath: string): string {
  return relative(vaultPath, dirPath).split(sep).join('/')
}

/** Lists explicit empty folders marked with `.fluffmind-folder`. */
export async function listVaultFolders(
  vaultPath: string,
  contentRoots: string[] = [],
): Promise<string[]> {
  const folders: string[] = []

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        const markerPath = join(fullPath, FOLDER_MARKER)
        try {
          await access(markerPath)
          const folderPath = toPosixPath(vaultPath, fullPath)
          if (folderPath) folders.push(folderPath)
        }
        catch {
          // no marker — still walk for nested markers
        }
        await walk(fullPath)
      }
    }
  }

  const directories = contentRoots.length === 0
    ? [vaultPath]
    : contentRoots.map(root => join(vaultPath, ...root.split('/')))
  for (const directory of directories) {
    try {
      await walk(directory)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  return [...new Set(folders)].sort((a, b) => a.localeCompare(b))
}

export async function createVaultFolder(workspaceId: string, folderPath: string): Promise<void> {
  const segments = folderPath.split('/').filter(Boolean)
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') {
      throw new InvalidNoteIdError(folderPath)
    }
  }

  return withWorkspaceWriteLock(workspaceId, async () => {
    const config = await resolveWorkspaceConfig(workspaceId)
    assertWithinContentRoots(folderPath, config.contentRoots)
    const targetDir = join(config.path, ...segments)
    const markerPath = join(targetDir, FOLDER_MARKER)

    await mkdir(targetDir, { recursive: true })
    await writeFile(markerPath, '{}\n', 'utf-8')

    // Mesh-live: persist files only — Git is export/backup, not the live path (ADR-016/018).
    // Same shape as mutations.commitMutation (no import — circular dep via FOLDER_MARKER).
    if (config.syncMode === 'mesh-live') {
      invalidateVaultIndex(workspaceId)
      publishVaultInvalidate(workspaceId, { reason: 'index' })
      return
    }

    const network = await resolveWorkspaceGitNetwork(workspaceId)
    const git = await ensureWorkingCopy({ ...config, accessToken: network.accessToken })
    await commitAndPush(git, {
      branch: config.branch,
      message: `Create folder ${folderPath}`,
      remoteConfigured: Boolean(config.remoteUrl),
      accessToken: network.accessToken,
    })
    invalidateVaultIndex(workspaceId)
    publishVaultInvalidate(workspaceId, { reason: 'index' })
  })
}
