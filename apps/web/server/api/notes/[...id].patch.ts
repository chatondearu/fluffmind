import { readJsonBody } from '../../utils/read-json-body'
import { requireWorkspacePermission } from '../../utils/auth'
import { renameNoteInWorkspace, VaultConflictError } from '../../vault/mutations'
import { GitConflictError, InvalidNoteIdError } from '../../vault/write'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing note id' })

  const body = await readJsonBody<{ newId?: string, folder?: string }>(event)
  const workspaceId = await requireWorkspacePermission(event, 'note', 'write')

  let targetId = typeof body?.newId === 'string' ? body.newId.trim() : ''
  if (!targetId && typeof body?.folder === 'string') {
    const folder = body.folder.trim().replace(/^\/+|\/+$/g, '')
    const basename = id.split('/').pop() ?? id
    targetId = folder ? `${folder}/${basename}` : basename
  }

  if (!targetId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing "newId" or "folder" in request body' })
  }

  try {
    return await renameNoteInWorkspace(workspaceId, id, targetId)
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
