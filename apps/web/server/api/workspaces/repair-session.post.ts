import { requireSession } from '../../utils/auth'
import { repairWorkspaceSession } from '../../utils/repair-workspace-session'
import { ACTIVE_WORKSPACE_COOKIE } from '../../vault/workspace'

export default defineEventHandler(async (event) => {
  const authSession = await requireSession(event)
  const result = await repairWorkspaceSession({
    userId: authSession.user.id,
    sessionId: authSession.session.id,
  })

  if (!result.workspaceId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'No workspace membership',
      message: 'You are not a member of any workspace.',
    })
  }

  setCookie(event, ACTIVE_WORKSPACE_COOKIE, result.workspaceId, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
  })

  return result
})
