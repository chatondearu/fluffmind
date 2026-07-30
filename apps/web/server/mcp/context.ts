export type { AgentTokenScope } from '../utils/agent-tokens'
import type { AgentTokenScope } from '../utils/agent-tokens'

export interface McpContext {
  /** Workspace id passed to writeToWorkspace (default when auth is off). */
  workspaceId: string
  /** Token or session capability. Session path is always write. */
  scope: AgentTokenScope
}

export const DEFAULT_MCP_WORKSPACE_ID = 'default'
