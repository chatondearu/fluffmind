import { ensureWorkingCopy, pullFromRemote } from '@fluffmind/integrations'
import type { PullFromRemoteResult } from '@fluffmind/integrations'

import { invalidateVaultIndex } from './service'
import { bootstrapWorkspace } from './sync'
import { resolveWorkspaceConfig } from './workspace'

/**
 * Pulls latest commits from origin into a workspace vault working copy.
 */
export async function pullWorkspaceChanges(workspaceId = 'default'): Promise<PullFromRemoteResult> {
  const config = await resolveWorkspaceConfig(workspaceId)
  if (!config.remoteUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'GIT_REMOTE_URL is not configured',
      message: 'Cannot pull without a Git remote.',
    })
  }

  await bootstrapWorkspace(workspaceId)
  const git = await ensureWorkingCopy(config)
  const result = await pullFromRemote(git, {
    branch: config.branch,
    remoteConfigured: true,
  })

  if (result.updated) {
    invalidateVaultIndex(workspaceId)
  }

  return result
}
