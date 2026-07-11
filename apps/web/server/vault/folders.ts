import { access, mkdir, readdir, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { InvalidNoteIdError } from './note-id'
import { invalidateVaultIndex } from './service'
import { resolveWorkspaceConfig } from './workspace'

export const FOLDER_MARKER = '.fluffmind-folder'

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.obsidian', '.vscode', '.foam'])

function toPosixPath(vaultPath: string, dirPath: string): string {
  return relative(vaultPath, dirPath).split(sep).join('/')
}

/** Lists explicit empty folders marked with `.fluffmind-folder`. */
export async function listVaultFolders(vaultPath: string): Promise<string[]> {
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
        } catch {
          // no marker — still walk for nested markers
        }
        await walk(fullPath)
      }
    }
  }

  await walk(vaultPath)
  return folders.sort((a, b) => a.localeCompare(b))
}

export async function createVaultFolder(workspaceId: string, folderPath: string): Promise<void> {
  const segments = folderPath.split('/').filter(Boolean)
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') {
      throw new InvalidNoteIdError(folderPath)
    }
  }

  const config = await resolveWorkspaceConfig(workspaceId)
  const targetDir = join(config.path, ...segments)
  const markerPath = join(targetDir, FOLDER_MARKER)

  await mkdir(targetDir, { recursive: true })
  await writeFile(markerPath, '{}\n', 'utf-8')
  invalidateVaultIndex(workspaceId)
}
