import { requireAdminInstance } from '../../utils/admin'
import { listAllWorkspaceMembers } from '../../utils/workspace-members'

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  return { workspaces: await listAllWorkspaceMembers() }
})
