import { createTask } from '../../mcp/handlers'
import { assertAgentWriteScope, requireAgentBearer } from '../../utils/agent-auth'
import { readJsonBody } from '../../utils/read-json-body'
import { rethrowVaultMutationError } from '../../utils/vault-mutation-error'

export default defineEventHandler(async (event) => {
  const auth = await requireAgentBearer(event)
  assertAgentWriteScope(auth.scope)

  const body = await readJsonBody<{ content?: string, noteId?: string }>(event)
  if (typeof body?.content !== 'string' || !body.content.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing "content" in request body' })
  }

  try {
    return await createTask(auth, body.content, body.noteId)
  }
  catch (error) {
    rethrowVaultMutationError(error)
  }
})
