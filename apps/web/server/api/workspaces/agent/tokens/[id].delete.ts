import { revokeWorkspaceAgentToken } from '../../../../utils/agent-tokens'
import { readJsonBody } from '../../../../utils/read-json-body'
import {
  auditAdminAction,
  parseWorkspaceId,
  requireWorkspaceManageAuthority,
} from '../../../../utils/workspace-manage-authority'

interface RevokeAgentTokenBody {
  workspaceId?: unknown
}

export default defineEventHandler(async (event) => {
  const body = await readJsonBody<RevokeAgentTokenBody>(event)
  const workspaceId = parseWorkspaceId(body.workspaceId)
  const authority = await requireWorkspaceManageAuthority(event, workspaceId)

  const tokenId = getRouterParam(event, 'id')
  if (!tokenId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing token id',
    })
  }

  await revokeWorkspaceAgentToken(authority.workspaceId, tokenId)
  await auditAdminAction(authority, 'workspace.agent.token.revoke', { tokenId })
  return { ok: true }
})
