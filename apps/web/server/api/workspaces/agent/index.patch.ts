import { getWorkspaceAgentStatus, setWorkspaceAgentEnabled } from '../../../utils/agent-tokens'
import { readJsonBody } from '../../../utils/read-json-body'
import {
  auditAdminAction,
  parseWorkspaceId,
  requireWorkspaceManageAuthority,
} from '../../../utils/workspace-manage-authority'

interface PatchAgentBody {
  workspaceId?: unknown
  agentEnabled?: boolean
}

export default defineEventHandler(async (event) => {
  const body = await readJsonBody<PatchAgentBody>(event)
  const workspaceId = parseWorkspaceId(body.workspaceId)
  const authority = await requireWorkspaceManageAuthority(event, workspaceId)

  if (typeof body.agentEnabled !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid payload',
      message: '"agentEnabled" boolean is required.',
    })
  }

  await setWorkspaceAgentEnabled(authority.workspaceId, body.agentEnabled)
  await auditAdminAction(authority, 'workspace.agent.patch', {
    agentEnabled: body.agentEnabled,
  })
  return getWorkspaceAgentStatus(authority.workspaceId)
})
