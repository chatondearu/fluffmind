import { createWorkspaceInvitation } from '../../../utils/github-invitations'
import { readJsonBody } from '../../../utils/read-json-body'
import { requireSession } from '../../../utils/auth'
import { requireWorkspaceManage } from '../../../utils/workspace-membership'
import { parseWorkspaceInvitationBody } from '../../../utils/workspace-invitation-api'

export default defineEventHandler(async (event) => {
  const workspaceId = await requireWorkspaceManage(event)
  const session = await requireSession(event)
  const body = parseWorkspaceInvitationBody(await readJsonBody<unknown>(event))

  return createWorkspaceInvitation({
    organizationId: workspaceId,
    inviterId: session.user.id,
    role: body.role,
    email: body.email,
    githubLogin: body.githubLogin,
    headers: event.headers,
  })
})
