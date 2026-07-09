import { getDb, member } from '@fluffmind/db'
import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'
import { requireSession } from '../../../utils/auth'
import {
  type LocalOverrideInput,
  getWorkspaceGitHubSyncState,
  syncWorkspaceMembersForOrganization,
} from '../../../utils/github-sync'
import { readJsonBody } from '../../../utils/read-json-body'
import { resolveActiveWorkspaceId } from '../../../vault/workspace'

interface SyncWorkspaceGitHubBody {
  run?: boolean
  localOverrides?: Array<{
    memberId?: string
    localOverride?: boolean
  }>
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
      message: 'GitHub sync requires owner role.',
    })
  }
}

function normalizeLocalOverrides(input: SyncWorkspaceGitHubBody['localOverrides']): LocalOverrideInput[] {
  if (!Array.isArray(input))
    return []

  const merged = new Map<string, boolean>()
  for (const item of input) {
    const memberId = typeof item.memberId === 'string' ? item.memberId.trim() : ''
    if (!memberId)
      continue
    merged.set(memberId, Boolean(item.localOverride))
  }

  return Array.from(merged, ([memberId, localOverride]) => ({ memberId, localOverride }))
}

export default defineEventHandler(async (event) => {
  const workspaceId = await resolveActiveWorkspaceId(event)
  await requireOwnerRole(event, workspaceId)

  const body = await readJsonBody<SyncWorkspaceGitHubBody>(event)
  const run = body.run !== false
  const localOverrides = normalizeLocalOverrides(body.localOverrides)

  if (!run)
    return getWorkspaceGitHubSyncState(workspaceId)

  try {
    return await syncWorkspaceMembersForOrganization(workspaceId, localOverrides)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GitHub sync failed.'
    throw createError({
      statusCode: 400,
      statusMessage: 'GitHub sync failed',
      message,
    })
  }
})
