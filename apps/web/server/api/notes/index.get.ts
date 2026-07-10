import { isAuthEnabled, requireWorkspacePermission } from '../../utils/auth'
import { resolveActiveWorkspaceId } from '../../vault/workspace'
import { getVaultIndex } from '../../vault/service'

export default defineEventHandler(async (event) => {
  const workspaceId = isAuthEnabled()
    ? await resolveActiveWorkspaceId(event)
    : 'default'

  if (isAuthEnabled()) {
    await requireWorkspacePermission(event, 'note', 'read')
  }

  const index = await getVaultIndex(workspaceId)
  const notes = [...index.notes.values()].sort((a, b) => a.title.localeCompare(b.title))
  return { notes }
})
