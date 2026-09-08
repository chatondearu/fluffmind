import { getDb, workspaceConfig, workspaceGithubLink } from '@fluffmind/db'
import { buildGitHubHttpsRemoteUrl, createInstallationToken, fetchCollaborators } from '@fluffmind/integrations'
import { eq } from 'drizzle-orm'
import { getGitHubAppCredentials, isGitHubAppConfigured } from '../../../utils/github-credentials'
import {
  ContentRootsImmutableError,
  setWorkspaceContentRootsIfAllowed,
  validateWorkspaceContentRootsUpdate,
} from '../../../utils/content-roots-config'
import type { ContentRootsUpdate } from '../../../utils/content-roots-config'
import { encryptSyncToken } from '../../../utils/github-token-crypto'
import { getWorkspaceGitHubSyncState, assertWorkspaceGithubLinkAbsent, parseRepoIdentifier } from '../../../utils/github-sync'
import { readJsonBody } from '../../../utils/read-json-body'
import {
  auditAdminAction,
  parseWorkspaceId,
  requireWorkspaceManageAuthority,
} from '../../../utils/workspace-manage-authority'
import { InvalidContentRootError } from '../../../vault/content-roots'
import { invalidateBootstrap } from '../../../vault/sync'

interface LinkWorkspaceGitHubBody {
  workspaceId?: unknown
  repository?: string
  mode?: 'app' | 'pat'
  syncToken?: string
  installationId?: string
  contentRoots?: string[]
}

export default defineEventHandler(async (event) => {
  const body = await readJsonBody<LinkWorkspaceGitHubBody>(event)
  const workspaceId = parseWorkspaceId(body.workspaceId)
  const authority = await requireWorkspaceManageAuthority(event, workspaceId)

  const repository = typeof body.repository === 'string' ? body.repository.trim() : ''
  const mode = body.mode ?? 'pat'
  const syncToken = typeof body.syncToken === 'string' ? body.syncToken.trim() : ''
  const installationId = typeof body.installationId === 'string' ? body.installationId.trim() : ''
  const appCredentials = mode === 'app' ? getGitHubAppCredentials() : null

  if (!repository) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid link payload',
      message: '"repository" (owner/repo) is required.',
    })
  }

  if (mode !== 'app' && mode !== 'pat') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid link mode',
      message: '"mode" must be either "app" or "pat".',
    })
  }

  if (mode === 'pat' && !syncToken) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid link payload',
      message: '"syncToken" is required when mode is "pat".',
    })
  }

  if (mode === 'app' && !installationId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid link payload',
      message: '"installationId" is required when mode is "app".',
    })
  }

  if (mode === 'app' && (!isGitHubAppConfigured() || !appCredentials)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'GitHub App unavailable',
      message: 'GitHub App credentials are not configured.',
    })
  }

  const parsedRepository = parseRepoIdentifier(repository)
  if (!parsedRepository) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid repository',
      message: 'Repository must follow the "owner/repo" format.',
    })
  }

  await assertWorkspaceGithubLinkAbsent(authority.workspaceId)
  let contentRootsUpdate: ContentRootsUpdate | undefined
  if (body.contentRoots !== undefined) {
    try {
      contentRootsUpdate = await validateWorkspaceContentRootsUpdate(authority.workspaceId, body.contentRoots)
    }
    catch (error) {
      if (error instanceof InvalidContentRootError) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid content root',
          message: error.message,
        })
      }
      if (error instanceof ContentRootsImmutableError) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Content roots are immutable',
          message: error.message,
        })
      }
      throw error
    }
  }

  try {
    const token = mode === 'app'
      ? (await createInstallationToken(appCredentials!, installationId)).token
      : syncToken
    await fetchCollaborators(token, parsedRepository.owner, parsedRepository.repo)
  } catch (error) {
    const details = error instanceof Error ? error.message : 'GitHub API call failed.'
    throw createError({
      statusCode: 400,
      statusMessage: 'GitHub validation failed',
      message: details,
    })
  }

  const db = getDb()
  await db
    .insert(workspaceGithubLink)
    .values({
      organizationId: authority.workspaceId,
      owner: parsedRepository.owner,
      repo: parsedRepository.repo,
      authMode: mode,
      installationId: mode === 'app' ? installationId : null,
      syncToken: mode === 'pat' ? encryptSyncToken(syncToken) : null,
      lastSyncedAt: null,
    })

  await db
    .update(workspaceConfig)
    .set({ gitRemoteUrl: buildGitHubHttpsRemoteUrl(parsedRepository.owner, parsedRepository.repo) })
    .where(eq(workspaceConfig.organizationId, authority.workspaceId))

  if (body.contentRoots !== undefined)
    await setWorkspaceContentRootsIfAllowed(authority.workspaceId, body.contentRoots, contentRootsUpdate)

  // The Git remote just changed — drop the cached bootstrap so the working copy is
  // re-adopted against the newly linked repository on the next access.
  invalidateBootstrap(authority.workspaceId)

  await auditAdminAction(authority, 'workspace.github.link', { repository })

  return getWorkspaceGitHubSyncState(authority.workspaceId)
})
