// Thin compatibility layer for the MCP handler surface.
//
// PRD-036's `mcp-tokens` module was generalized into `agent-tokens` by ADR-011
// (MCP tokens -> agent tokens rename, `fm_agent_...`, `workspace_agent_token`).
// The MCP tool layer (`server/mcp/handlers.ts`) keeps importing from this path
// name for its own identity lookup, so re-export the canonical implementation
// here instead of duplicating it.
export { getWorkspaceIdentity } from './agent-tokens'
