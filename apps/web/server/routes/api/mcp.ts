import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

import { DEFAULT_MCP_WORKSPACE_ID } from '../../mcp/context'
import { createFluffmindMcpServer } from '../../mcp/server'
import { isAuthEnabled, requireWorkspacePermission } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const workspaceId = isAuthEnabled()
    ? await requireWorkspacePermission(event, 'note', 'write')
    : DEFAULT_MCP_WORKSPACE_ID

  const server = createFluffmindMcpServer({ workspaceId })
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  await server.connect(transport)

  const request = toWebRequest(event)
  return transport.handleRequest(request)
})
