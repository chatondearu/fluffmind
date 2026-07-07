import { writeToWorkspace, GitConflictError } from '../../vault/write'

/**
 * Minimal, raw write endpoint for the P1 Git sync spike — not the real editor write
 * path (that comes with the block editor in P3). Just enough surface to exercise
 * writeToWorkspace end to end.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing note id' })

  const body = await readBody<{ content?: string }>(event)
  if (typeof body?.content !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing "content" in request body' })
  }

  try {
    return await writeToWorkspace('default', id, body.content)
  } catch (error) {
    if (error instanceof GitConflictError) {
      throw createError({ statusCode: 409, statusMessage: error.message })
    }
    throw error
  }
})
