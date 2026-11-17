import { requireWorkspacePermission } from '../../utils/auth'
import { rethrowVaultMutationError } from '../../utils/vault-mutation-error'
import { resolveSessionWriterId } from '../../vault/hosted-writer'
import { deleteNoteFromWorkspace } from '../../vault/mutations'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing note id' })

  const workspaceId = await requireWorkspacePermission(event, 'note', 'write')

  try {
    return await deleteNoteFromWorkspace(workspaceId, id, await resolveSessionWriterId(event))
  }
  catch (error) {
    rethrowVaultMutationError(error)
  }
})
