import { access } from 'node:fs/promises'
import { readJsonBody } from '../../utils/read-json-body'
import { requireWorkspacePermission } from '../../utils/auth'
import { rethrowVaultMutationError } from '../../utils/vault-mutation-error'
import { ContentHashMismatchError, writeToWorkspace } from '../../vault/write'
import { resolveNoteFilePath } from '../../vault/note-id'
import { resolveWorkspaceConfig } from '../../vault/workspace'

/**
 * Creates a new note via writeToWorkspace. Existing ids are rejected — updates go
 * through PUT /api/notes/:id.
 */
export default defineEventHandler(async (event) => {
  const body = await readJsonBody<{
    id?: string
    content?: string
    frontmatter?: Record<string, unknown>
    expectedContentHash?: string
  }>(event)
  if (typeof body?.id !== 'string' || !body.id.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing "id" in request body' })
  }
  if (typeof body?.content !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing "content" in request body' })
  }
  if (body.frontmatter !== undefined) {
    const fm = body.frontmatter
    if (typeof fm !== 'object' || fm === null || Array.isArray(fm)) {
      throw createError({ statusCode: 400, statusMessage: '"frontmatter" must be a plain object' })
    }
  }
  if (body.expectedContentHash !== undefined) {
    if (typeof body.expectedContentHash !== 'string' || !/^[a-f0-9]{64}$/i.test(body.expectedContentHash)) {
      throw createError({ statusCode: 400, statusMessage: '"expectedContentHash" must be a sha256 hex digest' })
    }
  }

  const id = body.id.trim()
  const workspaceId = await requireWorkspacePermission(event, 'note', 'write')

  try {
    const workspace = await resolveWorkspaceConfig(workspaceId)
    const filePath = resolveNoteFilePath(workspace.path, id)
    try {
      await access(filePath)
      throw createError({ statusCode: 409, statusMessage: 'Note already exists' })
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return await writeToWorkspace(workspaceId, id, body.content, {
      frontmatter: body.frontmatter,
      expectedContentHash: body.expectedContentHash,
    })
  }
  catch (error) {
    if (error instanceof ContentHashMismatchError) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: error.message,
      })
    }
    rethrowVaultMutationError(error)
  }
})
