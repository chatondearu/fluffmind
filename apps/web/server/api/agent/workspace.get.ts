import { getWorkspaceInfo } from '../../mcp/handlers'
import { requireAgentBearer } from '../../utils/agent-auth'

export default defineEventHandler(async (event) => {
  const auth = await requireAgentBearer(event)
  return getWorkspaceInfo(auth)
})
