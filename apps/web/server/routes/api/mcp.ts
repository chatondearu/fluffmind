import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

import { DEFAULT_MCP_WORKSPACE_ID } from '../../mcp/context'
import type { McpTokenScope } from '../../mcp/context'
import { createFluffmindMcpServer } from '../../mcp/server'
import { isAuthEnabled, requireWorkspacePermission } from '../../utils/auth'
import { extractMcpBearerToken, resolveMcpBearerAuth } from '../../utils/mcp-tokens'

export default defineEventHandler(async (event) => {
  let workspaceId = DEFAULT_MCP_WORKSPACE_ID
  let scope: McpTokenScope = 'write'

  const bearer = extractMcpBearerToken(getHeader(event, 'authorization'))
  if (bearer) {
    const auth = await resolveMcpBearerAuth(bearer)
    workspaceId = auth.workspaceId
    scope = auth.scope
  }
  else if (isAuthEnabled()) {
    workspaceId = await requireWorkspacePermission(event, 'note', 'write')
    scope = 'write'
  }

  const server = createFluffmindMcpServer({ workspaceId, scope })
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  await server.connect(transport)

  const request = toWebRequest(event)
  return transport.handleRequest(request)
})
