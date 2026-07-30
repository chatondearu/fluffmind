import { searchNotes } from '../../../mcp/handlers'
import { requireAgentBearer } from '../../../utils/agent-auth'

export default defineEventHandler(async (event) => {
  const { workspaceId } = await requireAgentBearer(event)

  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q : ''
  const limitRaw = typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : undefined
  const limit = limitRaw !== undefined && Number.isFinite(limitRaw) ? limitRaw : 20

  return searchNotes(q, limit, workspaceId)
})
