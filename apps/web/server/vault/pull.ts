import { ensureWorkingCopy, pullFromRemote } from '@fluffmind/integrations'
import type { PullFromRemoteResult } from '@fluffmind/integrations'

import { invalidateVaultIndex } from './service'
import { bootstrapWorkspace } from './sync'
import { workspaceConfigFromEnv } from './workspace'

/**
 * Pulls latest commits from origin into the env-configured vault working copy.
 * Invalidates the read index when new commits land.
 */
export async function pullWorkspaceChanges(): Promise<PullFromRemoteResult> {
  const config = workspaceConfigFromEnv()
  if (!config) {
    throw createError({
      statusCode: 503,
      statusMessage: 'VAULT_PATH is not configured',
    })
  }
  if (!config.remoteUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'GIT_REMOTE_URL is not configured',
      message: 'Cannot pull without a Git remote.',
    })
  }

  await bootstrapWorkspace()
  const git = await ensureWorkingCopy(config)
  const result = await pullFromRemote(git, {
    branch: config.branch,
    remoteConfigured: true,
  })

  if (result.updated) {
    invalidateVaultIndex()
  }

  return result
}
