import { acceptWorkspaceInvitation } from '../../../../utils/accept-workspace-invitation'
import { requireSession } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  const session = await requireSession(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid invitation',
      message: 'Identifiant d’invitation manquant.',
    })
  }

  return acceptWorkspaceInvitation({
    id,
    userId: session.user.id,
    userEmail: session.user.email,
    headers: event.headers,
  })
})
