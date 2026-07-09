import { getDb, member, workspaceGithubLink } from '@fluffmind/db'
import { fetchCollaborators } from '@fluffmind/integrations'
import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'
import { requireSession } from '../../../utils/auth'
import { encryptSyncToken, getWorkspaceGitHubSyncState, parseRepoIdentifier } from '../../../utils/github-sync'
import { readJsonBody } from '../../../utils/read-json-body'
import { resolveActiveWorkspaceId } from '../../../vault/workspace'

interface LinkWorkspaceGitHubBody {
  repository?: string
  syncToken?: string
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
  const syncToken = typeof body.syncToken === 'string' ? body.syncToken.trim() : ''

  if (!repository || !syncToken) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid link payload',
      message: 'Both "repository" (owner/repo) and "syncToken" are required.',
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

  try {
    await fetchCollaborators(syncToken, parsedRepository.owner, parsedRepository.repo)
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
      syncToken: encryptSyncToken(syncToken),
      lastSyncedAt: null,
    })
    .onConflictDoUpdate({
      target: workspaceGithubLink.organizationId,
      set: {
        owner: parsedRepository.owner,
        repo: parsedRepository.repo,
        syncToken: encryptSyncToken(syncToken),
      },
    })

  return getWorkspaceGitHubSyncState(workspaceId)
})
