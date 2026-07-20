import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { ensureWorkingCopy, commitAndPush, GitConflictError } from '@fluffmind/integrations'
import { withWorkspaceLock } from './lock'
import { InvalidNoteIdError, resolveNoteFilePath } from './note-id'
import { parseNote, serializeNoteFile } from './parser'
import { invalidateVaultIndex } from './service'
import { resolveWorkspaceConfig } from './workspace'

export { GitConflictError, InvalidNoteIdError }
export { WorkspaceLockTimeoutError, withWorkspaceLock as withWorkspaceWriteLock } from './lock'

export interface WriteResult {
  committed: boolean
  pushed: boolean
}

export interface WriteNoteOptions {
  /** When omitted on update, existing frontmatter is preserved from disk. */
  frontmatter?: Record<string, unknown>
}

async function resolveFrontmatterForWrite(
  filePath: string,
  isCreate: boolean,
  frontmatter?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (frontmatter !== undefined) {
    return frontmatter
  }

  if (isCreate) {
    return {}
  }

  try {
    const existing = await readFile(filePath, 'utf-8')
    return parseNote(existing).frontmatter
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}
    }
    throw error
  }
}

/**
 * The single write path for the vault: acquire the workspace lock, apply the change to
 * the server's working copy, commit + push (rebasing automatically on a rejected
 * push), release the lock, invalidate the read index. Updates an existing note or
 * creates a new one when `id` is not yet in the index.
 *
 * Assumes `VAULT_PATH` is set. The working copy is bootstrapped at server start (and
 * before the first index build) via `bootstrapWorkspace` — see `sync.ts` / #52.
 */
export async function writeToWorkspace(
  workspaceId: string,
  id: string,
  content: string,
  options?: WriteNoteOptions,
): Promise<WriteResult> {
  return withWorkspaceLock(workspaceId, async () => {
    const config = await resolveWorkspaceConfig(workspaceId)
    const filePath = resolveNoteFilePath(config.path, id)

    let isCreate = false
    try {
      await access(filePath)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await mkdir(dirname(filePath), { recursive: true })
      isCreate = true
    }

    const frontmatter = await resolveFrontmatterForWrite(filePath, isCreate, options?.frontmatter)
    const raw = serializeNoteFile(content, frontmatter)

    const git = await ensureWorkingCopy(config)
    await writeFile(filePath, raw, 'utf-8')
    const result = await commitAndPush(git, {
      branch: config.branch,
      message: isCreate ? `Create ${id}` : `Update ${id}`,
      remoteConfigured: Boolean(config.remoteUrl),
    })
    invalidateVaultIndex(workspaceId)
    return result
  })
}
