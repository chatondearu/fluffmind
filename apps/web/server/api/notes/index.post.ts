import { readJsonBody } from '../../utils/read-json-body'
import { writeToWorkspace, GitConflictError, InvalidNoteIdError } from '../../vault/write'
import { getVaultIndex } from '../../vault/service'

/**
 * Creates a new note via writeToWorkspace. Existing ids are rejected — updates go
 * through PUT /api/notes/:id.
 */
export default defineEventHandler(async (event) => {
  const body = await readJsonBody<{ id?: string, content?: string }>(event)
  if (typeof body?.id !== 'string' || !body.id.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing "id" in request body' })
  }
  if (typeof body?.content !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing "content" in request body' })
  }

  const id = body.id.trim()

  try {
    const index = await getVaultIndex()
    if (index.notes.has(id)) {
      throw createError({ statusCode: 409, statusMessage: 'Note already exists' })
    }
    return await writeToWorkspace('default', id, body.content)
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
