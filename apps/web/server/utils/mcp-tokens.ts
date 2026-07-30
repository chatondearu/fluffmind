/**
 * Compatibility shim: MCP token helpers were renamed to "agent tokens" (PRD-037).
 * Kept temporarily so existing MCP route/handler imports keep compiling; callers
 * should migrate to `./agent-tokens` directly (tracked in later PRD-037 tasks).
 */
import type {
  AgentTokenPublic,
  AgentTokenScope,
  CreatedAgentToken,
  ResolvedAgentTokenAuth,
} from './agent-tokens'
import {
  createWorkspaceAgentToken,
  extractAgentBearerToken,
  generateAgentTokenPlaintext,
  getWorkspaceAgentStatus,
  hashAgentToken,
  resolveAgentBearerAuth,
  revokeWorkspaceAgentToken,
  setWorkspaceAgentEnabled,
} from './agent-tokens'

export type McpTokenScope = AgentTokenScope
export type McpTokenPublic = AgentTokenPublic
export type CreatedMcpToken = CreatedAgentToken
export type ResolvedMcpTokenAuth = ResolvedAgentTokenAuth

export const hashMcpToken = hashAgentToken
export const generateMcpTokenPlaintext = generateAgentTokenPlaintext
export const extractMcpBearerToken = extractAgentBearerToken
export const createWorkspaceMcpToken = createWorkspaceAgentToken
export const revokeWorkspaceMcpToken = revokeWorkspaceAgentToken
export const resolveMcpBearerAuth = resolveAgentBearerAuth

export async function getWorkspaceMcpStatus(organizationId: string): Promise<{
  mcpEnabled: boolean
  tokens: AgentTokenPublic[]
}> {
  const { agentEnabled, tokens } = await getWorkspaceAgentStatus(organizationId)
  return { mcpEnabled: agentEnabled, tokens }
}

export async function setWorkspaceMcpEnabled(organizationId: string, mcpEnabled: boolean): Promise<void> {
  await setWorkspaceAgentEnabled(organizationId, mcpEnabled)
}
