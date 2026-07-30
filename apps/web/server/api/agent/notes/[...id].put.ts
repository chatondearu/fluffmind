import { writeNoteContent } from '../../../mcp/handlers'
import { assertAgentWriteScope, requireAgentBearer } from '../../../utils/agent-auth'
import { readJsonBody } from '../../../utils/read-json-body'
import { rethrowVaultMutationError } from '../../../utils/vault-mutation-error'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing note id' })

  const auth = await requireAgentBearer(event)
  assertAgentWriteScope(auth.scope)

  const body = await readJsonBody<{ content?: string }>(event)
  if (typeof body?.content !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing "content" in request body' })
  }

  try {
    return await writeNoteContent(auth, id, body.content)
  }
  catch (error) {
    rethrowVaultMutationError(error)
  }
})
