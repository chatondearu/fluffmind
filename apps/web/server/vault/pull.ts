import { ensureWorkingCopy, GitAuthError, GitConflictError, pullFromRemote } from '@fluffmind/integrations'
import type { PullFromRemoteResult } from '@fluffmind/integrations'

import { invalidateVaultIndex } from './service'
import { bootstrapWorkspace } from './sync'
import { resolveWorkspaceConfig, resolveWorkspaceGitNetwork } from './workspace'

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
  const network = await resolveWorkspaceGitNetwork(workspaceId)
  const git = await ensureWorkingCopy({ ...config, accessToken: network.accessToken })

  let result: PullFromRemoteResult
  try {
    result = await pullFromRemote(git, {
      branch: config.branch,
      remoteConfigured: true,
      accessToken: network.accessToken,
    })
  }
  catch (error) {
    if (error instanceof GitConflictError) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: error.message,
      })
    }
    if (error instanceof GitAuthError) {
      throw createError({
        statusCode: 502,
        statusMessage: 'Git authentication failed',
        message: 'Could not authenticate to the GitHub remote. Check App permissions or re-link sync in workspace settings.',
      })
    }
    throw error
  }

  if (result.updated) {
    invalidateVaultIndex(workspaceId)
  }

  return result
}
