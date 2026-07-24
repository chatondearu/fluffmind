import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { commitAndPush, ensureWorkingCopy, getSyncStatus, type SyncStatus } from '@fluffmind/integrations'

import { isAuthEnabled } from '../utils/auth'
import { vaultHasMarkdownNotes } from './index'
import { invalidateVaultIndex } from './service'
import { resolveWorkspaceConfig, resolveWorkspaceGitRemoteUrl } from './workspace'

const WELCOME_NOTE = `# Welcome to Fluffmind

Your vault is ready. Create notes from the home page or edit this file.

## Git sync (optional)

To back up notes on GitHub, set \`GIT_REMOTE_URL\` in your deployment environment and redeploy.
`

const bootstrapPromises = new Map<string, Promise<SyncStatus | null>>()

async function seedWelcomeNoteIfEmpty(
  workspaceId: string,
  vaultPath: string,
  branch: string,
  remoteConfigured: boolean,
): Promise<void> {
  if (await vaultHasMarkdownNotes(vaultPath))
    return

  const welcomePath = join(vaultPath, 'welcome.md')
  await writeFile(welcomePath, WELCOME_NOTE, 'utf-8')

  const config = await resolveWorkspaceConfig(workspaceId)
  const remoteUrl = await resolveWorkspaceGitRemoteUrl(workspaceId)
  const git = await ensureWorkingCopy({ ...config, networkRemoteUrl: remoteUrl })
  await commitAndPush(git, {
    branch,
    message: 'Seed welcome note',
    remoteConfigured,
    networkRemoteUrl: remoteUrl,
  })
  invalidateVaultIndex(workspaceId)
}

function logSyncWarnings(status: SyncStatus, branch: string): void {
  if (!status.remoteConfigured) return
  if (status.ahead > 0) {
    console.warn(
      `[vault] Workspace is ${status.ahead} commit(s) ahead of origin/${branch} — unpushed local commits detected.`,
    )
  }
  if (status.behind > 0) {
    console.warn(
      `[vault] Workspace is ${status.behind} commit(s) behind origin/${branch}.`,
    )
  }
}

/**
 * Ensures the Git working copy exists for a workspace before indexing.
 * Idempotent — cached per workspace id.
 */
export function bootstrapWorkspace(workspaceId = 'default'): Promise<SyncStatus | null> {
  if (!isAuthEnabled() && workspaceId !== 'default') {
    return bootstrapWorkspace('default')
  }

  const existing = bootstrapPromises.get(workspaceId)
  if (existing) return existing

  const promise = (async () => {
    const config = await resolveWorkspaceConfig(workspaceId)
    const remoteUrl = await resolveWorkspaceGitRemoteUrl(workspaceId)
    const git = await ensureWorkingCopy({ ...config, networkRemoteUrl: remoteUrl })
    await seedWelcomeNoteIfEmpty(
      workspaceId,
      config.path,
      config.branch,
      Boolean(config.remoteUrl),
    )
    const status = await getSyncStatus(git, {
      branch: config.branch,
      remoteConfigured: Boolean(config.remoteUrl),
    })
    logSyncWarnings(status, config.branch)
    return status
  })()

  bootstrapPromises.set(workspaceId, promise)
  return promise
}

/** Fresh sync status for API visibility — always re-reads from git. */
export async function getWorkspaceSyncStatus(workspaceId = 'default'): Promise<SyncStatus | null> {
  try {
    await bootstrapWorkspace(workspaceId)
    const config = await resolveWorkspaceConfig(workspaceId)
    const remoteUrl = await resolveWorkspaceGitRemoteUrl(workspaceId)
    const git = await ensureWorkingCopy({ ...config, networkRemoteUrl: remoteUrl })
    return getSyncStatus(git, {
      branch: config.branch,
      remoteConfigured: Boolean(config.remoteUrl),
    })
  } catch {
    return null
  }
}
