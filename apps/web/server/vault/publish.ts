import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { commitAndPush, ensureWorkingCopy } from '@fluffmind/integrations'
import { assertWithinContentRoots } from './content-roots'
import { InvalidNoteIdError, resolveNoteFilePath } from './note-id'
import { invalidateVaultIndex } from './service'
import { publishVaultInvalidate } from './vault-invalidate'
import {
  type WriterIdentity,
  WriterPrefixViolationError,
  assertNoteIdWritableByWriter,
  isUnderWritersTree,
  parseWriterIdentity,
  writerPathPrefix,
} from './writer-prefix'

export { isUnderWritersTree }
import { withWorkspaceLock } from './lock'
import { resolveWorkspaceConfig, resolveWorkspaceGitNetwork } from './workspace'

export class PublishTargetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublishTargetError'
  }
}

export interface PublishNoteOptions {
  /** Source note id (must be under the writer's prefix). */
  sourceId: string
  /**
   * Canonical target note id. Default: source path with `writers/<kind>/<id>/` stripped.
   * Must not be under any `writers/` tree.
   */
  targetId?: string
  writer: WriterIdentity | string
  /** When true (default), remove the draft after a successful publish (move). */
  removeDraft?: boolean
}

export interface PublishResult {
  sourceId: string
  targetId: string
  committed: boolean
  pushed: boolean
}

/**
 * Default publish target: strip `writers/<kind>/<id>/` from the source id.
 * `writers/user/alice/notes/foo` → `notes/foo`
 * `writers/user/alice` alone → error (nothing left to publish as a note name).
 */
export function defaultPublishTargetId(sourceId: string, writer: WriterIdentity): string {
  const prefix = writerPathPrefix(writer)
  const id = sourceId.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (id === prefix) {
    throw new PublishTargetError(
      `Cannot publish "${sourceId}" — provide targetId (source is only the writer root)`,
    )
  }
  if (!id.startsWith(`${prefix}/`)) {
    throw new WriterPrefixViolationError(
      `Source "${sourceId}" is outside writer prefix "${prefix}/"`,
    )
  }
  return id.slice(prefix.length + 1)
}

function resolveWriter(writer: WriterIdentity | string): WriterIdentity {
  return typeof writer === 'string' ? parseWriterIdentity(writer) : writer
}

/**
 * Explicit merge/publish: promote a draft under `writers/<kind>/<id>/` into a
 * canonical vault path (ADR-017). Sync apply must not do this — only this API.
 */
export async function publishNoteToCanonical(
  workspaceId: string,
  options: PublishNoteOptions,
): Promise<PublishResult> {
  const writer = resolveWriter(options.writer)
  const sourceId = options.sourceId.trim()
  assertNoteIdWritableByWriter(sourceId, writer)

  const targetId = (options.targetId?.trim() || defaultPublishTargetId(sourceId, writer))
  if (!targetId) {
    throw new PublishTargetError('Publish target id is required')
  }
  if (isUnderWritersTree(targetId)) {
    throw new PublishTargetError(
      `Publish target "${targetId}" must be canonical (not under writers/)`,
    )
  }

  const removeDraft = options.removeDraft !== false

  return withWorkspaceLock(workspaceId, async () => {
    const config = await resolveWorkspaceConfig(workspaceId)
    assertWithinContentRoots(sourceId, config.contentRoots)
    assertWithinContentRoots(targetId, config.contentRoots)

    const sourcePath = resolveNoteFilePath(config.path, sourceId)
    const targetPath = resolveNoteFilePath(config.path, targetId)

    try {
      await access(sourcePath)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new InvalidNoteIdError(`Source note not found: ${sourceId}`)
      }
      throw error
    }

    await mkdir(dirname(targetPath), { recursive: true })

    if (removeDraft) {
      // Move (LWW overwrite if target exists)
      try {
        await rm(targetPath, { force: true })
      }
      catch {
        // ignore
      }
      await rename(sourcePath, targetPath)
    }
    else {
      const raw = await readFile(sourcePath, 'utf-8')
      await writeFile(targetPath, raw, 'utf-8')
    }

    if (config.syncMode === 'mesh-live') {
      invalidateVaultIndex(workspaceId)
      publishVaultInvalidate(workspaceId, { reason: 'note-publish', noteId: targetId })
      return { sourceId, targetId, committed: false, pushed: false }
    }

    const network = await resolveWorkspaceGitNetwork(workspaceId)
    const git = await ensureWorkingCopy({ ...config, accessToken: network.accessToken })
    const result = await commitAndPush(git, {
      branch: config.branch,
      message: `Publish ${sourceId} -> ${targetId}`,
      remoteConfigured: Boolean(config.remoteUrl),
      accessToken: network.accessToken,
    })
    invalidateVaultIndex(workspaceId)
    publishVaultInvalidate(workspaceId, { reason: 'note-publish', noteId: targetId })
    return { sourceId, targetId, committed: result.committed, pushed: result.pushed }
  })
}
