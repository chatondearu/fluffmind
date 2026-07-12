import { requireWorkspacePermission } from '../../utils/auth'
import { deleteNoteFromWorkspace } from '../../vault/mutations'
import { GitConflictError, InvalidNoteIdError } from '../../vault/write'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing note id' })

  const workspaceId = await requireWorkspacePermission(event, 'note', 'write')

  try {
    return await deleteNoteFromWorkspace(workspaceId, id)
  } catch (error) {
    if (error instanceof GitConflictError) {
      throw createError({ statusCode: 409, statusMessage: 'Conflict', message: error.message })
    }
    if (error instanceof InvalidNoteIdError) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }
    throw error
  }
})
