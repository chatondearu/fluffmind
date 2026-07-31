import { requireAdminInstance } from '../../../utils/admin'
import { listAdminWorkspaces } from '../../../utils/admin-workspaces'

export default defineEventHandler(async (event) => {
  await requireAdminInstance(event)
  return listAdminWorkspaces()
})
