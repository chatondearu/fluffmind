export interface McpContext {
  /** Workspace id passed to writeToWorkspace (default when auth is off). */
  workspaceId: string
}

export const DEFAULT_MCP_WORKSPACE_ID = 'default'
