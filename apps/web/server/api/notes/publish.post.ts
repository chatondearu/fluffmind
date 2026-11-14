import { readJsonBody } from '../../utils/read-json-body'
import { requireWorkspacePermission } from '../../utils/auth'
import { rethrowVaultMutationError } from '../../utils/vault-mutation-error'
import { noteIdForMeshWriter, resolveSessionWriter } from '../../vault/hosted-writer'
import { publishNoteToCanonical } from '../../vault/publish'

/**
 * Explicit publish/merge: promote a draft under writers/<kind>/<id>/ to a
 * canonical vault path (ADR-017 / PRD-042 T4). Writer defaults to the session member.
 */
export default defineEventHandler(async (event) => {
  const body = await readJsonBody<{
    sourceId?: string
    targetId?: string
    writer?: string
    removeDraft?: boolean
  }>(event)

  if (typeof body?.sourceId !== 'string' || !body.sourceId.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing sourceId',
      message: '"sourceId" is required',
    })
  }
  if (body.writer !== undefined && typeof body.writer !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid writer',
      message: '"writer" must be a string when provided',
    })
  }
  if (body.targetId !== undefined && typeof body.targetId !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid targetId',
      message: '"targetId" must be a string when provided',
    })
  }
  if (body.removeDraft !== undefined && typeof body.removeDraft !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid removeDraft',
      message: '"removeDraft" must be a boolean when provided',
    })
  }

  const workspaceId = await requireWorkspacePermission(event, 'note', 'write')
  const writer = body.writer?.trim()
    ? body.writer.trim()
    : await resolveSessionWriter(event)
  const sourceId = typeof writer === 'string'
    ? body.sourceId.trim()
    : noteIdForMeshWriter(body.sourceId.trim(), writer)

  try {
    return await publishNoteToCanonical(workspaceId, {
      sourceId,
      targetId: body.targetId,
      writer,
      removeDraft: body.removeDraft,
    })
  }
  catch (error) {
    rethrowVaultMutationError(error)
  }
})
