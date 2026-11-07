import { readJsonBody } from '../../utils/read-json-body'
import { requireWorkspacePermission } from '../../utils/auth'
import { rethrowVaultMutationError } from '../../utils/vault-mutation-error'
import { ContentHashMismatchError, writeToWorkspace } from '../../vault/write'

/**
 * Minimal, raw write endpoint for the P1 Git sync spike — not the real editor write
 * path (that comes with the block editor in P3). Just enough surface to exercise
 * writeToWorkspace end to end. Creates the note when `id` does not exist yet.
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
