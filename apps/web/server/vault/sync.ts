import { ensureWorkingCopy, getSyncStatus, type SyncStatus } from '@fluffmind/integrations'
import { workspaceConfigFromEnv } from './workspace'

let bootstrapPromise: Promise<SyncStatus | null> | null = null

function logSyncWarnings(status: SyncStatus, branch: string): void {
  if (!status.remoteConfigured) return
  if (status.ahead > 0) {
    console.warn(
      `[vault] Workspace is ${status.ahead} commit(s) ahead of origin/${branch} — unpushed local commits detected.`
    )
  }
  if (status.behind > 0) {
    console.warn(
      `[vault] Workspace is ${status.behind} commit(s) behind origin/${branch}.`
    )
  }
}

/**
 * Ensures the Git working copy exists (clone/init/fetch) before the vault index is
 * built. Idempotent — safe to call from the Nitro boot plugin and from `getVaultIndex`.
 */
export function bootstrapWorkspace(): Promise<SyncStatus | null> {
  const config = workspaceConfigFromEnv()
  if (!config) return Promise.resolve(null)

  bootstrapPromise ??= (async () => {
    const git = await ensureWorkingCopy(config)
    const status = await getSyncStatus(git, {
      branch: config.branch,
      remoteConfigured: Boolean(config.remoteUrl)
    })
    logSyncWarnings(status, config.branch)
    return status
  })()

  return bootstrapPromise
}

/** Fresh sync status for API visibility — always re-reads from git, not the boot snapshot. */
export async function getWorkspaceSyncStatus(): Promise<SyncStatus | null> {
  const config = workspaceConfigFromEnv()
  if (!config) return null

  await bootstrapWorkspace()
  const git = await ensureWorkingCopy(config)
  return getSyncStatus(git, {
    branch: config.branch,
    remoteConfigured: Boolean(config.remoteUrl)
  })
}
