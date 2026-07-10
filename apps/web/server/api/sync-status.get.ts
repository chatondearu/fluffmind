import { isAuthEnabled } from '../utils/auth'
import { getWorkspaceSyncStatus } from '../vault/sync'
import { resolveActiveWorkspaceId } from '../vault/workspace'

export default defineEventHandler(async (event) => {
  const workspaceId = isAuthEnabled()
    ? await resolveActiveWorkspaceId(event)
    : 'default'

  const status = await getWorkspaceSyncStatus(workspaceId)
  if (!status) {
    throw createError({ statusCode: 503, statusMessage: 'VAULT_PATH is not configured' })
  }
  return status
})
