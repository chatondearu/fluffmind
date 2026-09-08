import { getDb, organization } from '@fluffmind/db'
import { eq } from 'drizzle-orm'
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
import {
  auditAdminAction,
  parseWorkspaceId,
  requireWorkspaceManageAuthority,
} from '../../../utils/workspace-manage-authority'
import { InvalidContentRootError } from '../../../vault/content-roots'
import { invalidateBootstrap } from '../../../vault/sync'

interface CreateAndLinkGithubRepoBody extends CreateGithubRepoBody {
  workspaceId?: unknown
  contentRoots?: string[]
}

export default defineEventHandler(async (event) => {
  const body = await readJsonBody<CreateAndLinkGithubRepoBody>(event)
  const workspaceId = parseWorkspaceId(body.workspaceId)
  const authority = await requireWorkspaceManageAuthority(event, workspaceId)

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
    .where(eq(organization.id, authority.workspaceId))
    .limit(1)

  if (!workspace) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Workspace not found',
      message: 'Workspace no longer exists.',
    })
  }

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

  const github = await createAndLinkGithubRepo({
    workspaceId: authority.workspaceId,
    workspaceSlug: workspace.slug,
    input,
    refuseIfLinked: true,
  })

  if (body.contentRoots !== undefined)
    await setWorkspaceContentRootsIfAllowed(authority.workspaceId, body.contentRoots, contentRootsUpdate)

  if (!github.ok)
    return { github }

  // A repo was just created and linked — re-adopt the working copy against it.
  invalidateBootstrap(authority.workspaceId)

  await auditAdminAction(authority, 'workspace.github.create_and_link', {
    repository: `${github.owner}/${github.repo}`,
  })

  return {
    github,
    ...(await getWorkspaceGitHubSyncState(authority.workspaceId)),
  }
})
