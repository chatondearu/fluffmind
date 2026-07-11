import { isAuthEnabled, requireWorkspacePermission } from '../../utils/auth'
import { listVaultFolders } from '../../vault/folders'
import { getVaultIndex } from '../../vault/service'
import { resolveActiveWorkspaceId, resolveWorkspaceConfig } from '../../vault/workspace'

export default defineEventHandler(async (event) => {
  const workspaceId = isAuthEnabled()
    ? await resolveActiveWorkspaceId(event)
    : 'default'

  if (isAuthEnabled()) {
    await requireWorkspacePermission(event, 'note', 'read')
  }

  const index = await getVaultIndex(workspaceId)
  const notes = [...index.notes.values()].sort((a, b) => a.title.localeCompare(b.title))
  const config = await resolveWorkspaceConfig(workspaceId)
  const folders = await listVaultFolders(config.path)
  return { notes, folders }
})
