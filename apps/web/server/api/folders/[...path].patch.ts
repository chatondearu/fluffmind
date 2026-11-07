import { readJsonBody } from '../../utils/read-json-body'
import { isAuthEnabled, requireWorkspacePermission } from '../../utils/auth'
import { rethrowVaultMutationError } from '../../utils/vault-mutation-error'
import { renameVaultFolder } from '../../vault/mutations'

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
    ? await requireWorkspacePermission(event, 'note', 'write')
    : 'default'

  try {
    return await renameVaultFolder(workspaceId, oldPath, newPath)
  }
  catch (error) {
    rethrowVaultMutationError(error)
  }
})
