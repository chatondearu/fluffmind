import { readJsonBody } from '../../utils/read-json-body'
import { isAuthEnabled, requireWorkspacePermission } from '../../utils/auth'
import { renameVaultFolder, VaultConflictError } from '../../vault/mutations'
import { GitConflictError, InvalidNoteIdError } from '../../vault/write'
import { resolveActiveWorkspaceId } from '../../vault/workspace'

export default defineEventHandler(async (event) => {
  const pathParam = getRouterParam(event, 'path')
  const oldPath = typeof pathParam === 'string' ? pathParam.trim().replace(/^\/+|\/+$/g, '') : ''
  if (!oldPath) {
    throw createError({ statusCode: 400, statusMessage: 'Folder path is required.' })
  }

  const body = await readJsonBody<{ newPath?: string }>(event)
  const newPath = typeof body?.newPath === 'string' ? body.newPath.trim().replace(/^\/+|\/+$/g, '') : ''
  if (!newPath) {
    throw createError({ statusCode: 400, statusMessage: 'Missing "newPath" in request body' })
  }

  const workspaceId = isAuthEnabled()
    ? await resolveActiveWorkspaceId(event)
    : 'default'

  if (isAuthEnabled()) {
    await requireWorkspacePermission(event, 'note', 'write')
  }

  try {
    return await renameVaultFolder(workspaceId, oldPath, newPath)
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
