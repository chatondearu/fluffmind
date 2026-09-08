import {
  parseWorkspaceId,
  requireWorkspaceMembership,
} from '../../utils/workspace-manage-authority'
import { listWorkspaceMembers } from '../../utils/workspace-members'

export default defineEventHandler(async (event) => {
  const workspaceId = parseWorkspaceId(getQuery(event).workspaceId)
  await requireWorkspaceMembership(event, workspaceId)
  return { members: await listWorkspaceMembers(workspaceId) }
})
