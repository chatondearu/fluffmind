import { getDb, member } from '@fluffmind/db'
import { and, eq } from 'drizzle-orm'
import { readJsonBody } from '../../utils/read-json-body'
import { requireSession } from '../../utils/auth'
import { ACTIVE_WORKSPACE_COOKIE } from '../../vault/workspace'

interface SetActiveWorkspaceBody {
  workspaceId?: string
}

export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const body = await readJsonBody<SetActiveWorkspaceBody>(event)
  const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : ''

  if (!workspaceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid workspace id',
      message: 'A non-empty "workspaceId" is required.',
    })
  }

  const db = getDb()
  const [workspaceMember] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, session.user.id)))
    .limit(1)

  if (!workspaceMember) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'You are not a member of this workspace.',
    })
  }

  setCookie(event, ACTIVE_WORKSPACE_COOKIE, workspaceMember.organizationId, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
  })

  return {
    workspaceId: workspaceMember.organizationId,
  }
})
