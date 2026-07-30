import { getVaultGraph } from '../../mcp/handlers'
import { requireAgentBearer } from '../../utils/agent-auth'

export default defineEventHandler(async (event) => {
  const { workspaceId } = await requireAgentBearer(event)
  return getVaultGraph(workspaceId)
})
