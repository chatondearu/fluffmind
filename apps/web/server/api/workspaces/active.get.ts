import { getDb, member, organization, workspaceConfig } from '@fluffmind/db'
import { and, eq } from 'drizzle-orm'
import { isAuthEnabled, requireSession } from '../../utils/auth'
import { resolveActiveWorkspaceId, workspaceConfigFromEnv } from '../../vault/workspace'

export default defineEventHandler(async (event) => {
  if (!isAuthEnabled()) {
    const config = workspaceConfigFromEnv()
    if (!config) {
      throw createError({
        statusCode: 503,
        statusMessage: 'VAULT_PATH is not configured',
        message: 'Set VAULT_PATH to use the default workspace when auth is disabled.'
      })
    }

    return {
      workspaceId: 'default',
      organization: null,
      member: null,
      config: {
        vaultPath: config.path,
        gitRemoteUrl: config.remoteUrl || null,
        gitBranch: config.branch
      }
    }
  }

  const session = await requireSession(event)
  const workspaceId = await resolveActiveWorkspaceId(event)
  const db = getDb()

  const [workspaceMember] = await db
    .select({
      id: member.id,
      role: member.role,
      organizationId: member.organizationId,
      userId: member.userId
    })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, session.user.id)))
    .limit(1)

  if (!workspaceMember) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'You are not a member of the selected workspace.'
    })
  }

  const [workspaceOrg] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo
    })
    .from(organization)
    .where(eq(organization.id, workspaceId))
    .limit(1)

  if (!workspaceOrg) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Workspace not found',
      message: `No organization found for workspace "${workspaceId}".`
    })
  }

  const [config] = await db
    .select({
      vaultPath: workspaceConfig.vaultPath,
      gitRemoteUrl: workspaceConfig.gitRemoteUrl,
      gitBranch: workspaceConfig.gitBranch
    })
    .from(workspaceConfig)
    .where(eq(workspaceConfig.organizationId, workspaceId))
    .limit(1)

  if (!config) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Workspace config not found',
      message: `No workspace configuration found for "${workspaceId}".`
    })
  }

  return {
    workspaceId,
    organization: workspaceOrg,
    member: {
      id: workspaceMember.id,
      role: workspaceMember.role
    },
    config
  }
})
