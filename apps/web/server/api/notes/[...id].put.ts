import { readJsonBody } from '../../utils/read-json-body'
import { requireWorkspacePermission } from '../../utils/auth'
import { rethrowVaultMutationError } from '../../utils/vault-mutation-error'
import { planMeshNoteWrite } from '../../vault/mesh-write'
import { ContentHashMismatchError, writeToWorkspace } from '../../vault/write'

/**
 * Create/update a note. On mesh-live, the session member is the writer and short
 * ids are stored under `writers/user/<id>/` (ADR-019 / PRD-042).
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing note id' })

  const body = await readJsonBody<{
    content?: string
    frontmatter?: Record<string, unknown>
    expectedContentHash?: string
  }>(event)
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
  const workspaceId = await requireWorkspacePermission(event, 'note', 'write')

  try {
    const plan = await planMeshNoteWrite(event, workspaceId, id, {
      frontmatter: body.frontmatter,
      expectedContentHash: body.expectedContentHash,
    })
    return await writeToWorkspace(workspaceId, plan.noteId, body.content, plan.options)
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
