import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { DEFAULT_MCP_WORKSPACE_ID } from './context'
import { createFluffmindMcpServer } from './server'

async function main() {
  if (!process.env.VAULT_PATH) {
    console.error('fluffmind-mcp: VAULT_PATH environment variable is required.')
    process.exit(1)
  }

  const workspaceId = process.env.MCP_WORKSPACE_ID ?? DEFAULT_MCP_WORKSPACE_ID
  const server = createFluffmindMcpServer({ workspaceId })
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`fluffmind-mcp: stdio transport ready (workspace=${workspaceId})`)
}

main().catch((error: unknown) => {
  console.error('fluffmind-mcp: fatal error', error)
  process.exit(1)
})
