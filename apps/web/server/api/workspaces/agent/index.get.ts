import { getWorkspaceAgentStatus } from '../../../utils/agent-tokens'
import {
  parseWorkspaceId,
  requireWorkspaceManageAuthority,
} from '../../../utils/workspace-manage-authority'

export default defineEventHandler(async (event) => {
  const workspaceId = parseWorkspaceId(getQuery(event).workspaceId)
  const authority = await requireWorkspaceManageAuthority(event, workspaceId)
  return getWorkspaceAgentStatus(authority.workspaceId)
})
