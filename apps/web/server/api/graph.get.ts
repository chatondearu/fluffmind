import { isAuthEnabled, requireWorkspacePermission } from '../utils/auth'
import { getGraph } from '../vault/index'
import { getVaultIndex } from '../vault/service'
import { resolveActiveWorkspaceId } from '../vault/workspace'

export default defineEventHandler(async (event) => {
  const workspaceId = isAuthEnabled()
    ? await resolveActiveWorkspaceId(event)
    : 'default'

  if (isAuthEnabled()) {
    await requireWorkspacePermission(event, 'note', 'read')
  }

  const index = await getVaultIndex(workspaceId)
  return getGraph(index)
})
