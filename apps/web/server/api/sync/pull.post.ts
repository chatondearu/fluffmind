import { isAuthEnabled, requireWorkspacePermission } from '../../utils/auth'
import { pullWorkspaceChanges } from '../../vault/pull'
import { getWorkspaceSyncStatus } from '../../vault/sync'

export default defineEventHandler(async (event) => {
  if (isAuthEnabled()) {
    await requireWorkspacePermission(event, 'workspace', 'manage')
  }

  const result = await pullWorkspaceChanges()
  const status = await getWorkspaceSyncStatus()
  return { ...result, status }
})
