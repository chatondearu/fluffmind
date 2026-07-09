import { readJsonBody } from '../../utils/read-json-body'
import { requireWorkspacePermission } from '../../utils/auth'
import { writeToWorkspace, GitConflictError, InvalidNoteIdError } from '../../vault/write'

/**
 * Minimal, raw write endpoint for the P1 Git sync spike — not the real editor write
 * path (that comes with the block editor in P3). Just enough surface to exercise
 * writeToWorkspace end to end. Creates the note when `id` does not exist yet.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing note id' })

  const body = await readJsonBody<{ content?: string }>(event)
  if (typeof body?.content !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing "content" in request body' })
  }
  const workspaceId = await requireWorkspacePermission(event, 'note', 'write')

  try {
    return await writeToWorkspace(workspaceId, id, body.content)
  } catch (error) {
    if (error instanceof GitConflictError) {
      // statusMessage becomes the raw HTTP reason phrase (restricted charset — Node
      // mangles non-ASCII like the em dash in error.message); keep it short and put
      // the real detail in `message`, which flows into the JSON body untouched.
      throw createError({ statusCode: 409, statusMessage: 'Conflict', message: error.message })
    }
    if (error instanceof InvalidNoteIdError) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }
    throw error
  }
})
