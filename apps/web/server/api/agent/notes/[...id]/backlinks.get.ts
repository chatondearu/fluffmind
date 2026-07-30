import { listBacklinks } from '../../../../mcp/handlers'
import { requireAgentBearer } from '../../../../utils/agent-auth'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing note id' })

  const { workspaceId } = await requireAgentBearer(event)
  return listBacklinks(id, workspaceId)
})
