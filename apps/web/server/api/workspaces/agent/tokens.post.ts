import { createWorkspaceAgentToken } from '../../../utils/agent-tokens'
import { readJsonBody } from '../../../utils/read-json-body'
import {
  auditAdminAction,
  parseWorkspaceId,
  requireWorkspaceManageAuthority,
} from '../../../utils/workspace-manage-authority'

interface CreateAgentTokenBody {
  workspaceId?: unknown
  name?: string
  scope?: string
}

export default defineEventHandler(async (event) => {
  const body = await readJsonBody<CreateAgentTokenBody>(event)
  const workspaceId = parseWorkspaceId(body.workspaceId)
  const authority = await requireWorkspaceManageAuthority(event, workspaceId)

  const name = typeof body.name === 'string' ? body.name : ''
  const scope = body.scope === 'read' || body.scope === 'write' ? body.scope : null
  if (!scope) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid scope',
      message: 'Scope must be "read" or "write".',
    })
  }

  const token = await createWorkspaceAgentToken({
    organizationId: authority.workspaceId,
    name,
    scope,
    createdByUserId: authority.session.user.id,
  })

  await auditAdminAction(authority, 'workspace.agent.token.create', {
    tokenId: token.id,
    scope,
  })

  return token
})
