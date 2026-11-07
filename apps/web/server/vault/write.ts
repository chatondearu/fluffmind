import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { ensureWorkingCopy, commitAndPush, GitConflictError } from '@fluffmind/integrations'
import { assertWithinContentRoots } from './content-roots'
import { withWorkspaceLock } from './lock'
import { InvalidNoteIdError, resolveNoteFilePath } from './note-id'
import { parseNote, serializeNoteFile } from './parser'
import { invalidateVaultIndex } from './service'
import { resolveWorkspaceConfig, resolveWorkspaceGitNetwork } from './workspace'

export { GitConflictError, InvalidNoteIdError }
export { WorkspaceLockTimeoutError, withWorkspaceLock as withWorkspaceWriteLock } from './lock'

/** Thrown when optional expectedContentHash does not match the on-disk file. */
export class ContentHashMismatchError extends Error {
  constructor(message = 'Content hash mismatch') {
    super(message)
    this.name = 'ContentHashMismatchError'
  }
}

export interface WriteResult {
  committed: boolean
  pushed: boolean
  /** sha256 hex of the file utf-8 bytes just written. */
  contentHash: string
}

export interface WriteNoteOptions {
  /** When omitted on update, existing frontmatter is preserved from disk. */
  frontmatter?: Record<string, unknown>
  /** Optional optimistic concurrency: sha256 hex of the prior file utf-8. */
  expectedContentHash?: string
}

function sha256Hex(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
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
    assertWithinContentRoots(id, config.contentRoots)
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

    if (options?.expectedContentHash && !isCreate) {
      const existing = await readFile(filePath, 'utf-8')
      if (sha256Hex(existing) !== options.expectedContentHash) {
        throw new ContentHashMismatchError()
      }
    }

    const frontmatter = await resolveFrontmatterForWrite(filePath, isCreate, options?.frontmatter)
    const raw = serializeNoteFile(content, frontmatter)
    const contentHash = sha256Hex(raw)

    const network = await resolveWorkspaceGitNetwork(workspaceId)
    const git = await ensureWorkingCopy({ ...config, accessToken: network.accessToken })
    await writeFile(filePath, raw, 'utf-8')
    const result = await commitAndPush(git, {
      branch: config.branch,
      message: isCreate ? `Create ${id}` : `Update ${id}`,
      remoteConfigured: Boolean(config.remoteUrl),
      accessToken: network.accessToken,
    })
    invalidateVaultIndex(workspaceId)
    return { ...result, contentHash }
  })
}
