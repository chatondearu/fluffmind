import { isAuthEnabled, requireWorkspacePermission } from '../../utils/auth'
import { rethrowVaultMutationError } from '../../utils/vault-mutation-error'
import { deleteVaultFolder } from '../../vault/mutations'

export default defineEventHandler(async (event) => {
  const pathParam = getRouterParam(event, 'path')
  const folderPath = typeof pathParam === 'string' ? pathParam.trim().replace(/^\/+|\/+$/g, '') : ''
  if (!folderPath) {
    throw createError({ statusCode: 400, statusMessage: 'Folder path is required.' })
  }

  const query = getQuery(event)
  const recursive = query.recursive === '1' || query.recursive === 'true'

  const workspaceId = isAuthEnabled()
    ? await requireWorkspacePermission(event, 'note', 'write')
    : 'default'

  try {
    return await deleteVaultFolder(workspaceId, folderPath, recursive)
  }
  catch (error) {
    rethrowVaultMutationError(error)
  }
})
