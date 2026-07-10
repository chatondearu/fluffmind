import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { ensureWorkingCopy, commitAndPush, GitConflictError } from '@fluffmind/integrations'
import { InvalidNoteIdError, resolveNoteFilePath } from './note-id'
import { invalidateVaultIndex } from './service'
import { resolveWorkspaceConfig } from './workspace'

export { GitConflictError, InvalidNoteIdError }

// In-memory lock per workspace: a chain of promises, so writes to the same workspace
// are strictly sequential. A failed write never poisons the chain — the next write
// still runs. Single-process only, matching DESIGN.md's documented MVP limit (a
// distributed lock across server instances is out of scope until P7).
const locks = new Map<string, Promise<unknown>>()

function withWorkspaceLock<T>(workspaceId: string, run: () => Promise<T>): Promise<T> {
  const previous = locks.get(workspaceId) ?? Promise.resolve()
  const settled = previous.then(run, run)
  locks.set(
    workspaceId,
    settled.then(
      () => undefined,
      () => undefined
    )
  )
  return settled
}

export interface WriteResult {
  committed: boolean
  pushed: boolean
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
export async function writeToWorkspace(workspaceId: string, id: string, content: string): Promise<WriteResult> {
  return withWorkspaceLock(workspaceId, async () => {
    const config = await resolveWorkspaceConfig(workspaceId)
    const filePath = resolveNoteFilePath(config.path, id)

    let isCreate = false
    try {
      await access(filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await mkdir(dirname(filePath), { recursive: true })
      isCreate = true
    }

    const git = await ensureWorkingCopy(config)
    await writeFile(filePath, content, 'utf-8')
    const result = await commitAndPush(git, {
      branch: config.branch,
      message: isCreate ? `Create ${id}` : `Update ${id}`,
      remoteConfigured: Boolean(config.remoteUrl)
    })
    invalidateVaultIndex(workspaceId)
    return result
  })
}
