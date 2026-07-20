import { readJsonBody } from '../../utils/read-json-body'
import { requireWorkspacePermission } from '../../utils/auth'
import { rethrowVaultMutationError } from '../../utils/vault-mutation-error'
import { renameNoteInWorkspace } from '../../vault/mutations'

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
  }
  catch (error) {
    rethrowVaultMutationError(error)
  }
})
