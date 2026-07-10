import { isAuthEnabled, requireWorkspacePermission } from '../../utils/auth'
import { pullWorkspaceChanges } from '../../vault/pull'
import { getWorkspaceSyncStatus } from '../../vault/sync'
import { resolveActiveWorkspaceId } from '../../vault/workspace'

export default defineEventHandler(async (event) => {
  const workspaceId = isAuthEnabled()
    ? await resolveActiveWorkspaceId(event)
    : 'default'

  if (isAuthEnabled()) {
    await requireWorkspacePermission(event, 'workspace', 'manage')
  }

  const result = await pullWorkspaceChanges(workspaceId)
  const status = await getWorkspaceSyncStatus(workspaceId)
  return { ...result, status }
})
