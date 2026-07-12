import { isAuthEnabled, requireWorkspacePermission } from '../../utils/auth'
import { deleteVaultFolder, VaultConflictError } from '../../vault/mutations'
import { GitConflictError, InvalidNoteIdError } from '../../vault/write'
import { resolveActiveWorkspaceId } from '../../vault/workspace'

export default defineEventHandler(async (event) => {
  const pathParam = getRouterParam(event, 'path')
  const folderPath = typeof pathParam === 'string' ? pathParam.trim().replace(/^\/+|\/+$/g, '') : ''
  if (!folderPath) {
    throw createError({ statusCode: 400, statusMessage: 'Folder path is required.' })
  }

  const query = getQuery(event)
  const recursive = query.recursive === '1' || query.recursive === 'true'

  const workspaceId = isAuthEnabled()
    ? await resolveActiveWorkspaceId(event)
    : 'default'

  if (isAuthEnabled()) {
    await requireWorkspacePermission(event, 'note', 'write')
  }

  try {
    return await deleteVaultFolder(workspaceId, folderPath, recursive)
  } catch (error) {
    if (error instanceof GitConflictError) {
      throw createError({ statusCode: 409, statusMessage: 'Conflict', message: error.message })
    }
    if (error instanceof VaultConflictError) {
      throw createError({ statusCode: 409, statusMessage: error.message })
    }
    if (error instanceof InvalidNoteIdError) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }
    throw error
  }
})
