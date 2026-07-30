import { getDb, member, organization } from '@fluffmind/db'
import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { requireSession } from '../../../utils/auth'
import {
  createAndLinkGithubRepo,
  parseCreateGithubRepoBody,
} from '../../../utils/github-create-repo'
import type { CreateGithubRepoBody } from '../../../utils/github-create-repo'
import {
  ContentRootsImmutableError,
  setWorkspaceContentRootsIfAllowed,
  validateWorkspaceContentRootsUpdate,
} from '../../../utils/content-roots-config'
import type { ContentRootsUpdate } from '../../../utils/content-roots-config'
import { getWorkspaceGitHubSyncState } from '../../../utils/github-sync'
import { readJsonBody } from '../../../utils/read-json-body'
import { InvalidContentRootError } from '../../../vault/content-roots'
import { resolveActiveWorkspaceId } from '../../../vault/workspace'

interface CreateAndLinkGithubRepoBody extends CreateGithubRepoBody {
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
      message: 'GitHub repository creation requires owner role.',
    })
  }
}

export default defineEventHandler(async (event) => {
  const workspaceId = await resolveActiveWorkspaceId(event)
  await requireOwnerRole(event, workspaceId)

  const body = await readJsonBody<CreateAndLinkGithubRepoBody>(event)
  const input = parseCreateGithubRepoBody(body)
  if (!input) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid payload',
      message: '"installationId" is required.',
    })
  }

  const db = getDb()
  const [workspace] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, workspaceId))
    .limit(1)

  if (!workspace) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Workspace not found',
      message: 'The active workspace no longer exists.',
    })
  }

  let contentRootsUpdate: ContentRootsUpdate | undefined
  if (body.contentRoots !== undefined) {
    try {
      contentRootsUpdate = await validateWorkspaceContentRootsUpdate(workspaceId, body.contentRoots)
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

  const github = await createAndLinkGithubRepo({
    workspaceId,
    workspaceSlug: workspace.slug,
    input,
    refuseIfLinked: true,
  })

  if (body.contentRoots !== undefined)
    await setWorkspaceContentRootsIfAllowed(workspaceId, body.contentRoots, contentRootsUpdate)

  if (!github.ok)
    return { github }

  return {
    github,
    ...(await getWorkspaceGitHubSyncState(workspaceId)),
  }
})
