import { access } from 'node:fs/promises'
import { readJsonBody } from '../../utils/read-json-body'
import { writeToWorkspace, GitConflictError, InvalidNoteIdError } from '../../vault/write'
import { resolveNoteFilePath } from '../../vault/note-id'
import { resolveActiveWorkspaceId, resolveWorkspaceConfig } from '../../vault/workspace'

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
  const workspaceId = await resolveActiveWorkspaceId(event)

  try {
    const workspace = await resolveWorkspaceConfig(workspaceId)
    const filePath = resolveNoteFilePath(workspace.path, id)
    try {
      await access(filePath)
      throw createError({ statusCode: 409, statusMessage: 'Note already exists' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return await writeToWorkspace(workspaceId, id, body.content)
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
