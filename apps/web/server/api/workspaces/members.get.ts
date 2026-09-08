import {
  parseWorkspaceId,
  requireWorkspaceManageAuthority,
} from '../../utils/workspace-manage-authority'
import { listWorkspaceMembers } from '../../utils/workspace-members'

export default defineEventHandler(async (event) => {
  const workspaceId = parseWorkspaceId(getQuery(event).workspaceId)
  await requireWorkspaceManageAuthority(event, workspaceId)
  return { members: await listWorkspaceMembers(workspaceId) }
})
