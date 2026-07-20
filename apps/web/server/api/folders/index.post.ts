import { isAuthEnabled, requireWorkspacePermission } from '../../utils/auth'
import { rethrowVaultMutationError } from '../../utils/vault-mutation-error'
import { createVaultFolder } from '../../vault/folders'
import { InvalidNoteIdError } from '../../vault/note-id'
import { resolveActiveWorkspaceId } from '../../vault/workspace'

export default defineEventHandler(async (event) => {
  const workspaceId = isAuthEnabled()
    ? await resolveActiveWorkspaceId(event)
    : 'default'

  if (isAuthEnabled()) {
    await requireWorkspacePermission(event, 'note', 'write')
  }

  const body = await readBody<{ path?: string }>(event)
  const folderPath = typeof body?.path === 'string' ? body.path.trim().replace(/^\/+|\/+$/g, '') : ''
  if (!folderPath) {
    throw createError({ statusCode: 400, statusMessage: 'Folder path is required.' })
  }

  try {
    await createVaultFolder(workspaceId, folderPath)
    return { path: folderPath }
  }
  catch (error) {
    if (error instanceof InvalidNoteIdError) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid folder path.' })
    }
    rethrowVaultMutationError(error)
  }
})
