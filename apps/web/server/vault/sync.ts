import { ensureWorkingCopy, getSyncStatus, type SyncStatus } from '@fluffmind/integrations'

import { isAuthEnabled } from '../utils/auth'
import { resolveWorkspaceConfig } from './workspace'

const bootstrapPromises = new Map<string, Promise<SyncStatus | null>>()

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
    const git = await ensureWorkingCopy(config)
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
    const git = await ensureWorkingCopy(config)
    return getSyncStatus(git, {
      branch: config.branch,
      remoteConfigured: Boolean(config.remoteUrl),
    })
  } catch {
    return null
  }
}
