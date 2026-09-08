import { createWorkspaceInvitation } from '../../../utils/github-invitations'
import { readJsonBody } from '../../../utils/read-json-body'
import {
  auditAdminAction,
  parseWorkspaceId,
  requireWorkspaceManageAuthority,
} from '../../../utils/workspace-manage-authority'
import { parseWorkspaceInvitationBody } from '../../../utils/workspace-invitation-api'

export default defineEventHandler(async (event) => {
  const body = await readJsonBody<unknown>(event)
  const workspaceId = parseWorkspaceId((body as { workspaceId?: unknown }).workspaceId)
  const parsed = parseWorkspaceInvitationBody(body)
  const authority = await requireWorkspaceManageAuthority(event, workspaceId)

  const result = await createWorkspaceInvitation({
    organizationId: workspaceId,
    inviterId: authority.session.user.id,
    role: parsed.role,
    email: parsed.email,
    githubLogin: parsed.githubLogin,
    headers: event.headers,
  })

  await auditAdminAction(authority, 'workspace.invitation.create', { role: parsed.role })
  return result
})
