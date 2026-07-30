import { getDb, member, workspaceConfig, workspaceGithubLink } from '@fluffmind/db'
import { buildGitHubHttpsRemoteUrl, createInstallationToken, fetchCollaborators } from '@fluffmind/integrations'
import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'
import { requireSession } from '../../../utils/auth'
import { getGitHubAppCredentials, isGitHubAppConfigured } from '../../../utils/github-credentials'
import {
  ContentRootsImmutableError,
  setWorkspaceContentRootsIfAllowed,
  validateWorkspaceContentRootsUpdate,
} from '../../../utils/content-roots-config'
import { encryptSyncToken } from '../../../utils/github-token-crypto'
import { getWorkspaceGitHubSyncState, assertWorkspaceGithubLinkAbsent, parseRepoIdentifier } from '../../../utils/github-sync'
import { readJsonBody } from '../../../utils/read-json-body'
import { InvalidContentRootError } from '../../../vault/content-roots'
import { resolveActiveWorkspaceId } from '../../../vault/workspace'

interface LinkWorkspaceGitHubBody {
  repository?: string
  mode?: 'app' | 'pat'
  syncToken?: string
  installationId?: string
  contentRoots?: string[]
}

async function requireOwnerRole(event: H3Event, workspaceId: string): Promise<void> {
  const session = await requireSession(event)
  const db = getDb()

  const [workspaceMember] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, session.user.id)))
    .limit(1)

  if (!workspaceMember || workspaceMember.role !== 'owner') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'GitHub linking requires owner role.',
    })
  }
}

export default defineEventHandler(async (event) => {
  const workspaceId = await resolveActiveWorkspaceId(event)
  await requireOwnerRole(event, workspaceId)

  const body = await readJsonBody<LinkWorkspaceGitHubBody>(event)
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

  await assertWorkspaceGithubLinkAbsent(workspaceId)
  if (body.contentRoots !== undefined) {
    try {
      await validateWorkspaceContentRootsUpdate(workspaceId, body.contentRoots)
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
      organizationId: workspaceId,
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
    .where(eq(workspaceConfig.organizationId, workspaceId))

  if (body.contentRoots !== undefined)
    await setWorkspaceContentRootsIfAllowed(workspaceId, body.contentRoots)

  return getWorkspaceGitHubSyncState(workspaceId)
})
