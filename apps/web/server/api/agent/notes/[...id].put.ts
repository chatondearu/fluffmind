import { writeToWorkspace } from '../../../vault/write'
import { noteIdForMeshWriter, writerIdentityForAgent } from '../../../vault/hosted-writer'
import { resolveWorkspaceConfig } from '../../../vault/workspace'
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
    const config = await resolveWorkspaceConfig(auth.workspaceId)
    const writer = writerIdentityForAgent(auth.tokenId)
    const noteId = config.syncMode === 'mesh-live' ? noteIdForMeshWriter(id, writer) : id
    return await writeToWorkspace(
      auth.workspaceId,
      noteId,
      body.content,
      config.syncMode === 'mesh-live' ? { writer } : undefined,
    )
  }
  catch (error) {
    rethrowVaultMutationError(error)
  }
})
