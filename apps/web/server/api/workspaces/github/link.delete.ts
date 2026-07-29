import { getDb, member } from '@fluffmind/db'
import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'

import { requireSession } from '../../../utils/auth'
import { unlinkWorkspaceGithubSync } from '../../../utils/github-sync'
import { resolveActiveWorkspaceId } from '../../../vault/workspace'

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
      message: 'Unlinking GitHub sync requires owner role.',
    })
  }
}

export default defineEventHandler(async (event) => {
  const workspaceId = await resolveActiveWorkspaceId(event)
  await requireOwnerRole(event, workspaceId)
  return unlinkWorkspaceGithubSync(workspaceId)
})
