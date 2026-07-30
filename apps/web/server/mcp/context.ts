export type McpTokenScope = 'read' | 'write'

export interface McpContext {
  /** Workspace id passed to writeToWorkspace (default when auth is off). */
  workspaceId: string
  /** Token or session capability. Session path is always write. */
  scope: McpTokenScope
}

export const DEFAULT_MCP_WORKSPACE_ID = 'default'
