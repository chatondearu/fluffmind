import { writeFile } from 'node:fs/promises'
import { ensureWorkingCopy, commitAndPush, GitConflictError } from '@fluffmind/integrations'
import { getVaultIndex, invalidateVaultIndex } from './service'

export { GitConflictError }

interface WorkspaceConfig {
  path: string
  remoteUrl?: string
  branch: string
}

/**
 * Resolves a workspace id to its working-copy config. A single workspace, sourced from
 * env vars, until real multi-workspace resolution (Postgres-backed) lands in P2 — the
 * `workspaceId` parameter is kept on `writeToWorkspace` to match the target signature
 * from DESIGN.md rather than break it later.
 */
function resolveWorkspaceConfig(_workspaceId: string): WorkspaceConfig {
  const path = process.env.VAULT_PATH
  if (!path) throw new Error('VAULT_PATH environment variable is not set')
  return {
    path,
    remoteUrl: process.env.GIT_REMOTE_URL || undefined,
    branch: process.env.GIT_BRANCH || 'main'
  }
}

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
 * push), release the lock, invalidate the read index. Editing an existing note only —
 * creating new notes isn't supported by this spike.
 *
 * Assumes `VAULT_PATH` already contains the note being edited (either a pre-existing
 * local vault, or a working copy cloned there ahead of time) — auto-bootstrapping a
 * fresh clone before the read index's first build isn't handled here yet.
 */
export async function writeToWorkspace(workspaceId: string, id: string, content: string): Promise<WriteResult> {
  return withWorkspaceLock(workspaceId, async () => {
    const config = resolveWorkspaceConfig(workspaceId)
    const index = await getVaultIndex()
    const note = index.notes.get(id)
    if (!note) throw new Error(`Cannot write "${id}": note does not exist (creating new notes isn't supported yet)`)

    const git = await ensureWorkingCopy(config)
    await writeFile(note.filePath, content, 'utf-8')
    const result = await commitAndPush(git, {
      branch: config.branch,
      message: `Update ${id}`,
      remoteConfigured: Boolean(config.remoteUrl)
    })
    invalidateVaultIndex()
    return result
  })
}
